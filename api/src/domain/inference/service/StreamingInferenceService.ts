/**
 * Port of domain/inference/service/StreamingInferenceService(+Impl).
 *
 * `streamChatCompletion(ctx, user, projectId, modelId, previousChatTurnId, prompts)` does the
 * synchronous part of the Java method (project/model checks, chat turn creation, PENDING status,
 * provider strategy) and throws like Java did before the Flux was returned. It returns an async
 * generator that replaces the Flux: it yields the provider's chunks unchanged and, on the first
 * `isComplete` chunk, persists the response and yields the final chunk with `finalChatDTO`.
 * If the provider stream (or the finalisation) fails, the inference status is set to FAILED
 * (doOnError) and the error is rethrown from the iteration.
 */
import type { Ctx } from "../../../lib/ctx";
import { IllegalInputException, RuntimeException } from "../../../lib/errors";
import * as ChatEntity from "../../../entities/Chat";
import * as InferenceMonitoringEntity from "../../../entities/InferenceMonitoring";
import type { InferenceMonitoring } from "../../../entities/InferenceMonitoring";
import * as ModelInputEntity from "../../../entities/ModelInput";
import * as ModelResponseEntity from "../../../entities/ModelResponse";
import type { Model } from "../../../entities/Model";
import type { Project } from "../../../entities/Project";
import type { User } from "../../../entities/User";
import { InferenceStatusEnum } from "../../../enums/InferenceStatusEnum";
import * as ChatProviderFactory from "../../../llmproviders/ChatProviderFactory";
import { type Prompt, fromModelInput, fromModelResponse } from "../../../llmproviders/dto/Prompt";
import { type StreamingChatResponse, newStreamingChatResponse } from "../../../llmproviders/dto/StreamingChatResponse";
import * as ChatRepository from "../../chat/ChatRepository";
import * as ChatService from "../../chat/service/ChatService";
import type { ChatTurnDTO } from "../../chatturn/dto/ChatTurnDTO";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import * as InferenceMonitoringRepository from "../../inferencemonitoring/InferenceMonitoringRepository";
import * as InferenceStatusService from "../../inferencestatus/InferenceStatusService";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as ModelService from "../../model/service/ModelService";
import * as ProjectService from "../../project/ProjectService";
import * as TagLinkService from "../../tags/TagLinkService";
import { newInferenceDTO } from "../dto/InferenceDTO";
import {
  type LoadedChat,
  type LoadedChatTurn,
  asLoadedModelResponse,
  loadChatTurn,
  loadChatTurnsOf,
  newChatTurn,
  saveChatTurn,
} from "./ChatTurnGraph";

export async function streamChatCompletion(
  ctx: Ctx,
  user: User,
  projectId: string,
  modelId: string,
  previousChatTurnId: string | null | undefined,
  prompts: Prompt[] | null | undefined,
): Promise<AsyncGenerator<StreamingChatResponse>> {
  const project = await ProjectService.getProjectForUser(ctx, user, projectId);
  if (prompts == null) throw new RuntimeException(`Cannot invoke "java.util.List.iterator()" because "prompts" is null`);
  const modelInputs = prompts.map((prompt) => ModelInputEntity.fromPrompt(prompt, user.id));

  let chat: LoadedChat;
  let chatTurn: LoadedChatTurn;
  let previousChatTurns: LoadedChatTurn[] | null = null;
  if (previousChatTurnId != null) {
    const row = await ChatTurnRepository.findByIdAndUser(ctx.db, previousChatTurnId, user.id as string);
    if (row == null) throw new IllegalInputException("Previous chat turn not found");
    const previousChatTurn = await loadChatTurn(ctx.db, row);
    chat = previousChatTurn.chat;
    previousChatTurns = await loadChatTurnsOf(ctx.db, chat);
    chatTurn = newChatTurn(chat, {
      inputs: modelInputs,
      userId: user.id,
      sequenceId: (previousChatTurn.sequenceId ?? 0) + 1,
    });
  } else {
    // chatService.createChat(user, project)
    chat = await ChatRepository.save(ctx.db, ChatEntity.create({ containerId: project.id, userId: user.id }));
    chat.turns = [];
    chatTurn = newChatTurn(chat, { inputs: modelInputs, userId: user.id, sequenceId: 0 });
  }

  const savedChatTurn = await saveChatTurn(ctx, chatTurn, user);
  // `previousChatTurns` is the chat's turn list itself in Java, so it now also holds the new turn:
  // its prompts are part of the history and it is the "previous" turn for monitoring.
  (chat.turns as LoadedChatTurn[]).push(savedChatTurn);

  return streamChatCompletionInternal(ctx, user, project, modelId, prompts, previousChatTurns, savedChatTurn);
}

async function streamChatCompletionInternal(
  ctx: Ctx,
  user: User,
  project: Project,
  modelId: string,
  prompts: Prompt[],
  previousChatTurns: LoadedChatTurn[] | null,
  chatTurn: LoadedChatTurn,
): Promise<AsyncGenerator<StreamingChatResponse>> {
  const model = await ModelService.getModelForUser(ctx, user, modelId);
  if (model.isDeprecated) throw new IllegalInputException("Model is deprecated");

  const inferenceMonitoring = await getPreviousInferenceMonitoring(ctx, previousChatTurns);
  const finalPrompts = getPrompts(prompts, previousChatTurns);

  const inferenceDTO = newInferenceDTO({
    user_id: user.id,
    project_id: project.id,
    chat_turn_id: chatTurn.id,
    model_id: modelId,
    comments: "Streaming inference",
  });
  await InferenceStatusService.createOrUpdateInferenceStatus(ctx, inferenceDTO, InferenceStatusEnum.PENDING);

  const providerStrategy = await ChatProviderFactory.getStrategy(ctx, model, user);

  return (async function* () {
    let content = "";
    let finalizationDone = false;
    try {
      for await (const response of providerStrategy.streamChat(finalPrompts)) {
        if (response.content != null) content += response.content;
        if (response.isComplete && !finalizationDone) {
          finalizationDone = true;
          yield await finalize(ctx, response, content, user, model, project, modelId, chatTurn, inferenceMonitoring);
        } else {
          yield response;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      inferenceDTO.comments = message;
      await InferenceStatusService.createOrUpdateInferenceStatus(ctx, inferenceDTO, InferenceStatusEnum.FAILED);
      console.error(`Error during streaming chat completion: ${message}`);
      throw error;
    }
  })();
}

function getPrompts(prompts: Prompt[], previousChatTurns: LoadedChatTurn[] | null): Prompt[] {
  if (previousChatTurns == null || previousChatTurns.length === 0) return prompts;
  const newPrompts: Prompt[] = [];
  for (const chatTurn of previousChatTurns) {
    for (const modelInput of chatTurn.inputs) newPrompts.push(fromModelInput(modelInput));
    if (chatTurn.modelResponse != null) newPrompts.push(fromModelResponse(chatTurn.modelResponse));
  }
  if (prompts != null) newPrompts.push(...prompts);
  return newPrompts;
}

async function getPreviousInferenceMonitoring(
  ctx: Ctx,
  previousChatTurns: LoadedChatTurn[] | null,
): Promise<InferenceMonitoring | null> {
  if (previousChatTurns == null || previousChatTurns.length === 0) return null;
  const id = previousChatTurns[previousChatTurns.length - 1]?.modelResponse?.inferenceMonitoringId;
  return id ? InferenceMonitoringRepository.findById(ctx.db, id) : null;
}

/** processStreamingResponse for the completion chunk: persist everything, build the final chunk. */
async function finalize(
  ctx: Ctx,
  response: StreamingChatResponse,
  accumulatedContent: string,
  user: User,
  model: Model,
  project: Project,
  modelId: string,
  chatTurn: LoadedChatTurn,
  previousInferenceMonitoring: InferenceMonitoring | null,
): Promise<StreamingChatResponse> {
  // new InferenceMonitoring(...) is persisted through ModelResponse's cascade PERSIST.
  const im = InferenceMonitoringEntity.createForTurn(model, user.id, project.id, previousInferenceMonitoring);
  if (response.latency != null) InferenceMonitoringEntity.setTimetaken(im, response.latency);
  if (response.usage != null) {
    if (response.usage.promptTokens != null) InferenceMonitoringEntity.setPromptTokens(im, response.usage.promptTokens);
    if (response.usage.completionTokens != null) {
      InferenceMonitoringEntity.setCompletionTokens(im, response.usage.completionTokens);
    }
    if (response.usage.totalTokens != null) InferenceMonitoringEntity.setTotalTokens(im, response.usage.totalTokens);
  }
  const inferenceMonitoring = await InferenceMonitoringRepository.save(ctx.db, im);

  const modelResponse = asLoadedModelResponse(
    await ModelResponseRepository.save(
      ctx.db,
      ModelResponseEntity.create({
        text: accumulatedContent,
        thinking: response.thinking,
        modelId: model.id,
        userId: user.id,
        containerId: project.id,
        inferenceMonitoringId: inferenceMonitoring.id,
      }),
    ),
    model,
  );

  chatTurn.modelResponse = modelResponse;
  const savedChatTurn = await saveChatTurn(ctx, chatTurn, user);
  console.info(
    `Saved ChatTurn - id: ${savedChatTurn.id}, modelResponse: ${savedChatTurn.modelResponse?.id ?? "null"}, chat: ${savedChatTurn.chat?.id ?? "null"}`,
  );

  await InferenceStatusService.createOrUpdateInferenceStatus(
    ctx,
    newInferenceDTO({
      user_id: user.id,
      project_id: project.id,
      chat_turn_id: savedChatTurn.id,
      model_id: modelId,
      comments: "Streaming inference completed",
    }),
    InferenceStatusEnum.SUCCESSFUL,
  );

  const chatTurnDTO = await ChatService.getChatTurnDTO(ctx, savedChatTurn.id as string, user);
  // The new ChatTurn entity never had its (mappedBy) inferenceStatus set in Java.
  const raw = chatTurnDTO as unknown as Record<string, unknown>;
  raw.inference_status = null;
  raw.inference_reason = null;

  await TagLinkService.syncInferenceMonitoringTags(ctx, inferenceMonitoring.id as string, user);

  console.info(
    `Streaming chat completion completed for user: ${user.id}, model: ${modelId}, finalChatDTO: ${savedChatTurn.id}`,
  );

  return buildFinalResponse(response, chatTurnDTO);
}

function buildFinalResponse(response: StreamingChatResponse, chatTurnDTO: ChatTurnDTO): StreamingChatResponse {
  return newStreamingChatResponse({
    content: response.content,
    isComplete: true,
    usage: response.usage,
    model: response.model,
    finishReason: response.finishReason,
    latency: response.latency,
    finalChatDTO: chatTurnDTO,
  });
}
