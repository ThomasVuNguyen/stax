/**
 * Port of domain/inference/service/InferenceService(+Impl).
 *
 * Exported API (Java names, `ctx` first):
 * - addModelResponseToChatturn(ctx, user, project, modelId, previousChatTurns, chatTurn, preflight?)
 * - runInference(ctx, user, projectId, modelId, prompts, previousChatTurns, variables)
 * - runReinferenceForProject(ctx, user, projectId, modelIds)            → BulkInferenceResponseDTO
 * - runReinference(ctx, user, projectId, chatTurnIds, modelIds)         → BulkInferenceResponseDTO
 * - reRunInferenceAndUpdateResponse(ctx, dto)                           → boolean
 * - process(ctx, dto)       queue consumer body; the @CheckJobActive check is done by jobs.ts
 * - runEvaluationInference(ctx, user, model, modelInputs)               → ChatResponseWithLatency
 *
 * Chat turns are LoadedChatTurn objects (see ChatTurnGraph) instead of JPA entities.
 *
 * Differences forced by Workers/D1 (see also InferencePublisherService):
 * - No @Transactional rollback. To avoid leaving half-written chats behind on the errors Java
 *   raised after its writes, callers may resolve the model + provider strategy up front and pass
 *   them as `preflight` (Playground does); the same errors are raised, only earlier.
 * - Bulk runs prepare every row in the request (as Java did) but create the PENDING statuses and
 *   send the queue messages in batches after the loop.
 */
import type { Ctx } from "../../../lib/ctx";
import { IllegalArgumentException, IllegalInputException, IllegalStateException, NotFoundException, RuntimeException } from "../../../lib/errors";
import * as ModelResponseEntity from "../../../entities/ModelResponse";
import type { InferenceMonitoring } from "../../../entities/InferenceMonitoring";
import type { Model } from "../../../entities/Model";
import type { ModelInput } from "../../../entities/ModelInput";
import type { Project } from "../../../entities/Project";
import type { User } from "../../../entities/User";
import { InferenceStatusEnum, getInferenceStatusEnumByKey, getKey } from "../../../enums/InferenceStatusEnum";
import { JobStatusEnum } from "../../../enums/JobStatusEnum";
import * as ChatProviderFactory from "../../../llmproviders/ChatProviderFactory";
import type { ChatProviderStrategy } from "../../../llmproviders/ChatProviderStrategy";
import type { ChatResponseWithLatency } from "../../../llmproviders/dto/ChatResponseWithLatency";
import { type Prompt, fromModelInput } from "../../../llmproviders/dto/Prompt";
import * as PlanckConstants from "../../../util/PlanckConstants";
import { containsVariableInput } from "../../../util/PromptUtil";
import * as ChatEntity from "../../../entities/Chat";
import * as ChatRepository from "../../chat/ChatRepository";
import * as ChatService from "../../chat/service/ChatService";
import type { ChatTurnDTO } from "../../chatturn/dto/ChatTurnDTO";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import * as HumanEvalScoreRepository from "../../evaluation/HumanEvalScoreRepository";
import * as ScoreV2Repository from "../../evaluation/ScoreV2Repository";
import * as InferenceMonitoringRepository from "../../inferencemonitoring/InferenceMonitoringRepository";
import * as InferenceMonitoringService from "../../inferencemonitoring/InferenceMonitoringService";
import * as InferenceStatusService from "../../inferencestatus/InferenceStatusService";
import * as JobStatusService from "../../job/JobStatusService";
import * as ModelInputEntity from "../../../entities/ModelInput";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as ModelService from "../../model/service/ModelService";
import * as ProjectService from "../../project/ProjectService";
import * as InferencePublisherService from "../../pubsub/InferencePublisherService";
import * as TagLinkService from "../../tags/TagLinkService";
import * as UserService from "../../user/UserService";
import { type BulkInferenceResponseDTO, newBulkInferenceResponseDTO } from "../dto/BulkInferenceResponseDTO";
import { type InferenceDTO, newInferenceDTO } from "../dto/InferenceDTO";
import * as InferencePreparationService from "./InferencePreparationService";
import { javaRuntimeException } from "./JavaExceptions";
import {
  type LoadedChat,
  type LoadedChatTurn,
  type LoadedModelResponse,
  asLoadedModelResponse,
  loadChatTurn,
  loadChatTurns,
  loadChatTurnsOf,
  newChatTurn,
  saveChatTurn,
} from "./ChatTurnGraph";

/** Model + provider strategy resolved before any write (see header). */
export interface InferencePreflight {
  model: Model;
  strategy: ChatProviderStrategy;
}

/** Resolves the model (deprecation check included) and the provider strategy, as Java did later. */
export async function preflight(ctx: Ctx, user: User, modelId: string): Promise<InferencePreflight> {
  const model = await ModelService.getModelForUser(ctx, user, modelId);
  if (model.isDeprecated) throw new IllegalInputException("Model is deprecated");
  return { model, strategy: await ChatProviderFactory.getStrategy(ctx, model, user) };
}

function errorMessage(e: unknown): string | null {
  return e instanceof Error ? e.message : e == null ? null : String(e);
}

/**
 * `new ChatTurnDTO(chatTurn)` of the in-memory turn. The DTO is built from the saved rows by the
 * chat service; the in-memory JPA entity only carried an inference status when one was loaded
 * with it or set explicitly, so `hasInferenceStatus=false` blanks those two fields as Java did.
 */
async function toChatTurnDTO(ctx: Ctx, chatTurn: LoadedChatTurn, user: User, hasInferenceStatus: boolean): Promise<ChatTurnDTO> {
  const dto = await ChatService.getChatTurnDTO(ctx, chatTurn.id as string, user);
  if (!hasInferenceStatus) {
    const raw = dto as unknown as Record<string, unknown>;
    raw.inference_status = null;
    raw.inference_reason = null;
  }
  return dto;
}

// ---------------------------------------------------------------------------------------------

export async function addModelResponseToChatturn(
  ctx: Ctx,
  user: User,
  project: Project,
  modelId: string,
  previousChatTurns: LoadedChatTurn[] | null,
  chatTurn: LoadedChatTurn,
  pre?: InferencePreflight,
): Promise<ChatTurnDTO> {
  const model = pre?.model ?? (await ModelService.getModelForUser(ctx, user, modelId));
  if (model.isDeprecated) throw new IllegalInputException("Model is deprecated");

  const previousInferenceMonitoring = await getPreviousInferenceMonitoring(ctx, previousChatTurns);

  const chatPrompt = await InferencePreparationService.buildPromptHistory(ctx, previousChatTurns, chatTurn);

  const dto = newInferenceDTO({
    user_id: user.id,
    project_id: project.id,
    chat_turn_id: chatTurn.id,
    model_id: modelId,
    comments: "Sync inference",
  });

  // The JPA entity only exposed a status that was loaded with it (and updated in place).
  const hadInferenceStatus = chatTurn.inferenceStatus != null;

  const chatResponse = await executeInferenceWithModel(ctx, model, user, chatPrompt, dto, chatTurn, project, pre?.strategy);
  if (chatResponse == null) {
    // Inference failed and status/chatTurn updated in executeInferenceWithModel
    await saveChatTurn(ctx, chatTurn, user);
    return toChatTurnDTO(ctx, chatTurn, user, true);
  }

  const monitoring = await saveSuccessfulInferenceResponse(
    ctx,
    user,
    project,
    model,
    chatResponse,
    previousInferenceMonitoring,
    dto,
    chatTurn,
  );
  await saveChatTurn(ctx, chatTurn, user);
  const chatDtoResult = await toChatTurnDTO(ctx, chatTurn, user, hadInferenceStatus);
  await TagLinkService.syncInferenceMonitoringTags(ctx, monitoring.id as string, user);
  return chatDtoResult;
}

export async function runInference(
  ctx: Ctx,
  user: User,
  projectId: string,
  modelId: string,
  prompts: Prompt[],
  previousChatTurns: LoadedChatTurn[] | null,
  variables: Record<string, string> | null,
): Promise<ChatTurnDTO> {
  const project = await ProjectService.getProjectForUser(ctx, user, projectId);
  const previousChatTurn =
    previousChatTurns != null && previousChatTurns.length ? previousChatTurns[previousChatTurns.length - 1] : null;
  const chatTurn = await saveModelInputRequest(ctx, user, project, prompts, previousChatTurn, variables);
  return addModelResponseToChatturn(ctx, user, project, modelId, previousChatTurns, chatTurn);
}

async function saveModelInputRequest(
  ctx: Ctx,
  user: User,
  project: Project,
  prompts: Prompt[],
  previousChatTurn: LoadedChatTurn | null,
  variables: Record<string, string> | null,
): Promise<LoadedChatTurn> {
  validatePrompts(prompts);

  let chat: LoadedChat;
  if (previousChatTurn != null) {
    chat = previousChatTurn.chat;
    await ChatService.addOrUpdateVariables(ctx, chat.id as string, user, variables as Record<string, string>);
    chat.variables = (await ChatRepository.findById(ctx.db, chat.id as string))?.variables ?? chat.variables;
  } else {
    // chatService.createChat(null, project, user, variables)
    chat = await ChatRepository.save(
      ctx.db,
      ChatEntity.create({ containerId: project.id, userId: user.id, ...(variables != null ? { variables } : {}) }),
    );
  }

  const modelInputs: ModelInput[] = prompts.map((prompt) =>
    prompt.text != null && containsVariableInput(prompt.text)
      ? ModelInputEntity.fromPrompt(prompt, user.id, chat.variables)
      : ModelInputEntity.fromPrompt(prompt, user.id),
  );
  // modelInputService.savePrompt(...) for each: the inputs are persisted together with the turn.
  const chatTurn = newChatTurn(chat, {
    inputs: modelInputs,
    userId: user.id,
    sequenceId: previousChatTurn != null ? (previousChatTurn.sequenceId ?? 0) + 1 : 0,
  });
  return saveChatTurn(ctx, chatTurn, user);
}

export async function runReinferenceForProject(
  ctx: Ctx,
  user: User,
  projectId: string,
  modelIds: string[] | null | undefined,
): Promise<BulkInferenceResponseDTO> {
  const chatTurnIds = await getChatTurnIdsByProjectId(ctx, user, projectId);
  console.info(
    `Running bulk quick compare inference for project: ${projectId}, number of requests: ${chatTurnIds.length}`,
  );
  return runInferenceCommon(ctx, user, projectId, chatTurnIds, modelIds);
}

export async function runReinference(
  ctx: Ctx,
  user: User,
  projectId: string,
  chatTurnIds: string[] | null | undefined,
  modelIds: string[] | null | undefined,
): Promise<BulkInferenceResponseDTO> {
  // Java: chatTurnIds.size() on a missing list → NullPointerException → 500 RUNTIME_ERROR.
  if (chatTurnIds == null) throw nullPointer();
  console.info(
    `Running bulk quick compare inference for project: ${projectId}, number of requests: ${chatTurnIds.length}`,
  );
  return runInferenceCommon(ctx, user, projectId, chatTurnIds, modelIds);
}

/** A java.lang.NullPointerException without message. */
const nullPointer = () => javaRuntimeException(null);

async function runInferenceCommon(
  ctx: Ctx,
  user: User,
  projectId: string,
  chatTurnIds: string[],
  modelIds: string[] | null | undefined,
): Promise<BulkInferenceResponseDTO> {
  const project = await ProjectService.getProjectForUser(ctx, user, projectId);

  const chatTurns = await loadChatTurns(ctx.db, await ChatTurnRepository.findChatTurnsByList(ctx.db, chatTurnIds, user.id as string));

  const modelToChatTurns = filterChatTurnsByModels(chatTurns, modelIds);
  const totalTasks = [...modelToChatTurns.values()].reduce((n, l) => n + l.length, 0);
  if (totalTasks === 0) throw new IllegalInputException("No eligible chat turns found for inference");

  const job = await JobStatusService.createScorerJobStatus(
    ctx,
    PlanckConstants.INFERENCE,
    null,
    user,
    JobStatusEnum.PENDING,
    totalTasks,
    project,
  );

  // Determine if this is a bulk job (more than 10 chat turns)
  const isBulk = chatTurnIds.length > 10;

  const outbox = InferencePublisherService.newOutbox();
  const failed: InferenceDTO[] = [];

  // In case the chat turn doesn't have a model response, for the 1st loop interation
  // We have to run with modelId which was provided without duplicate. Any following runs -
  // duplicate it.
  let duplicateOnNoResponse = false;
  for (const [modelId, turns] of modelToChatTurns) {
    for (const ct of turns) {
      const dto = newInferenceDTO({ user_id: user.id, project_id: projectId, job_id: job.id, chat_turn_id: ct.id });
      try {
        if (modelId != null) {
          await InferencePublisherService.sendInferenceWithModel(ctx, ct, dto, modelId, duplicateOnNoResponse, isBulk, outbox);
        } else {
          await InferencePublisherService.sendInferenceUsingExistingModel(ctx, ct, dto, outbox);
        }
      } catch (e) {
        await markFailed(ctx, dto, e);
        failed.push(dto);
      }
    }
    // after 1st loop, duplicate any chat turns without model response
    duplicateOnNoResponse = true;
  }

  try {
    await InferencePublisherService.flushOutbox(ctx, outbox);
  } catch (e) {
    const unsent = ((e as { unsent?: InferenceDTO[] }).unsent ?? []) as InferenceDTO[];
    for (const dto of unsent) {
      await markFailed(ctx, dto, e);
      failed.push(dto);
    }
    if (!unsent.length) throw e;
  }
  // Java tracked the job after every failed row; the final state is the same once all rows exist.
  if (failed.length) await trackJobStatus(ctx, failed[failed.length - 1]);

  return newBulkInferenceResponseDTO(job.id, chatTurnIds);
}

async function markFailed(ctx: Ctx, dto: InferenceDTO, e: unknown): Promise<void> {
  dto.comments = `Inference processing failed: ${errorMessage(e)}`;
  console.error(`Failed to process inference for jobId=${dto.job_id}. Error:`, e);
  await InferenceStatusService.createOrUpdateInferenceStatus(ctx, dto, InferenceStatusEnum.FAILED);
}

// --- java.util.HashMap iteration order (the loop order decides which model avoids duplication) ---

function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function javaHashMapOrder<T>(entries: [string | null, T][]): Map<string | null, T> {
  const unique = new Map<string | null, T>();
  for (const [k, v] of entries) unique.set(k, v); // put() keeps the first position
  let cap = 16;
  while (unique.size > cap * 0.75) cap *= 2;
  const bucket = (k: string | null) => {
    if (k === null) return 0;
    const h = javaStringHash(k);
    return (h ^ (h >>> 16)) & (cap - 1);
  };
  const keys = [...unique.keys()].map((k, i) => ({ k, i, b: bucket(k) }));
  keys.sort((a, b) => a.b - b.b || a.i - b.i);
  return new Map(keys.map(({ k }) => [k, unique.get(k) as T]));
}

function filterChatTurnsByModels(
  chatTurns: LoadedChatTurn[],
  modelIds: string[] | null | undefined,
): Map<string | null, LoadedChatTurn[]> {
  if (modelIds == null || modelIds.length === 0) {
    const eligible = chatTurns.filter((ct) => {
      const s = ct.inferenceStatus;
      return s == null || getKey(InferenceStatusEnum.PENDING) !== s.status;
    });
    // null - to use original model id from chat turn
    return new Map([[null, eligible]]);
  }
  const entries: [string, LoadedChatTurn[]][] = modelIds.map((modelId) => [
    modelId,
    chatTurns.filter((ct) => {
      // no response/model - eligible, since that is the first inference for that chat turn
      const mr = ct.modelResponse;
      if (mr == null || mr.model == null) return true;
      const s = ct.inferenceStatus;
      return !(s != null && getKey(InferenceStatusEnum.PENDING) === s.status && modelId === mr.model.id);
    }),
  ]);
  return javaHashMapOrder(entries);
}

// ---------------------------------------------------------------------------------------------

export async function reRunInferenceAndUpdateResponse(ctx: Ctx, dto: InferenceDTO): Promise<boolean> {
  let successful = false;
  const user = await UserService.findByUserId(ctx, dto.user_id as string);
  const project = await ProjectService.getProjectForUser(ctx, user, dto.project_id as string);

  const chatTurn = await getValidatedChatTurn(ctx, dto.chat_turn_id as string, user);
  const chatHistory = await validateIsLatestChatTurn(ctx, chatTurn);

  const model = await resolveModel(ctx, user, chatTurn, dto);
  const prompts = await InferencePreparationService.buildPromptHistory(ctx, chatHistory, chatTurn);

  if (model == null) {
    throw new RuntimeException(`Cannot invoke "com.planck.planck.entitities.Model.getProvider()" because "model" is null`);
  }
  const providerStrategy = await ChatProviderFactory.getStrategy(ctx, model, user);

  const previousModelResponse = chatTurn.modelResponse;
  chatTurn.modelResponse = null;

  const previousMonitoring = previousModelResponse?.inferenceMonitoringId
    ? await InferenceMonitoringRepository.findById(ctx.db, previousModelResponse.inferenceMonitoringId)
    : null;
  // Java computed the evaluation-monitoring ids of the turn's response *after* detaching it, so
  // the set was always empty and the evaluation-monitoring cleanup never ran; it is omitted.
  let reply: string | null = null;
  let thinking: string | null = null;
  let monitoring: InferenceMonitoring | null = null;
  try {
    const chatResponse = await providerStrategy.chat(prompts);
    reply = chatResponse.reply;
    thinking = chatResponse.thinking;
    monitoring = await InferenceMonitoringService.saveInferenceMonitoring(
      ctx,
      user,
      chatResponse,
      model,
      project,
      previousMonitoring,
    );
    successful = true;
  } catch (e) {
    console.error("Exception while communicating with LLM", e);
    dto.reason = errorMessage(e);
  }

  const response = await createOrUpdateModelResponse(
    ctx,
    previousModelResponse,
    reply,
    thinking,
    model,
    user,
    project,
    monitoring,
  );
  chatTurn.modelResponse = response;
  await saveChatTurn(ctx, chatTurn, user);

  await cleanupOrphanedEntities(ctx, previousModelResponse, user);

  return successful;
}

async function getChatTurnIdsByProjectId(ctx: Ctx, user: User, projectId: string): Promise<string[]> {
  // chatService.findLatestChatTurnIdsByProjectId(projectId, user)
  const chatTurnIds = await ChatTurnRepository.findLatestChatTurnIdsByContainerId(ctx.db, projectId, user.id as string);
  if (!chatTurnIds.length) {
    throw new IllegalInputException("Project does not have any chat turns. Provide a valid project.");
  }
  return chatTurnIds;
}

/**
 * Queue consumer body (@CheckJobActive is applied by the caller, see jobs.ts). Never throws for
 * inference failures: they are recorded on the inference status and the job.
 */
export async function process(ctx: Ctx, inferenceDTO: InferenceDTO): Promise<void> {
  try {
    const currentInferenceStatus = await InferenceStatusService.findByChatTurnIdAndUser(
      ctx,
      inferenceDTO.chat_turn_id,
      inferenceDTO.user_id,
    );
    if (getInferenceStatusEnumByKey(currentInferenceStatus.status) === InferenceStatusEnum.STOPPED) {
      console.info(`Skipping processing for Inference (id: ${currentInferenceStatus.id}), because its status is STOPPED.`);
      return;
    }
    await InferenceStatusService.updateInferenceStatus(ctx, inferenceDTO, InferenceStatusEnum.IN_PROGRESS, "Response In-progress");

    const successful = await reRunInferenceAndUpdateResponse(ctx, inferenceDTO);
    // to be implemented - current functionality does not include tracking overall job status
    await trackJobStatus(ctx, inferenceDTO);
    const status = successful ? InferenceStatusEnum.SUCCESSFUL : InferenceStatusEnum.FAILED;
    const inferenceComment = successful ? "Inference Processing Successfully done." : "Inference Status failed";
    await InferenceStatusService.updateInferenceStatus(ctx, inferenceDTO, status, inferenceComment);
    await trackJobStatus(ctx, inferenceDTO);
  } catch (e) {
    console.error("Inference run failed due to exception:", e);
    await InferenceStatusService.updateInferenceStatus(
      ctx,
      inferenceDTO,
      InferenceStatusEnum.FAILED,
      `Inference run failed due to error.${errorMessage(e)}`,
    );
    await trackJobStatus(ctx, inferenceDTO);
  }
}

export async function runEvaluationInference(
  ctx: Ctx,
  user: User,
  model: Model,
  modelInputs: ModelInput[],
): Promise<ChatResponseWithLatency> {
  if (model.isDeprecated) throw new IllegalInputException("Model is deprecated");
  const prompts = modelInputs.map(fromModelInput);
  const providerStrategy = await ChatProviderFactory.getStrategy(ctx, model, user);
  return providerStrategy.chat(prompts);
}

async function getValidatedChatTurn(ctx: Ctx, chatTurnId: string, user: User): Promise<LoadedChatTurn> {
  const row = await ChatTurnRepository.findByIdAndUser(ctx.db, chatTurnId, user.id as string);
  if (row == null) throw new NotFoundException(`ChatTurn: ${chatTurnId} not found for this user`);
  const chatTurn = await loadChatTurn(ctx.db, row);

  if (!chatTurn.inputs.length) throw new IllegalInputException("ChatTurn does not have any inputs");

  // prepare variables on model input (persisted with the turn's inputs, like the JPA merge)
  for (const input of chatTurn.inputs) {
    if (input.text != null && containsVariableInput(input.text)) input.variables = chatTurn.chat.variables;
  }
  return chatTurn;
}

async function validateIsLatestChatTurn(ctx: Ctx, chatTurn: LoadedChatTurn): Promise<LoadedChatTurn[]> {
  // chatService.getChat(chatId, user): turns ordered by sequence (a separate set of objects)
  const rows = await ChatTurnRepository.findByChatIdAndUserIdOrderBySequenceId(
    ctx.db,
    chatTurn.chatId as string,
    chatTurn.userId as string,
    null,
    null,
  );
  if (!rows.length || chatTurn.id !== rows[rows.length - 1].id) {
    throw new IllegalArgumentException("ChatTurn must be the latest in chat");
  }
  if (rows.length === 1) return [];
  return loadChatTurns(ctx.db, rows.slice(0, rows.length - 1), { chats: [chatTurn.chat] });
}

async function trackJobStatus(ctx: Ctx, inferenceDTO: InferenceDTO): Promise<void> {
  await JobStatusService.trackJobStatusCommon(ctx, inferenceDTO.job_id as string, () =>
    InferenceStatusService.findAllByUserAndJobId(ctx, inferenceDTO.job_id, inferenceDTO.user_id),
  );
}

async function resolveModel(ctx: Ctx, user: User, chatTurn: LoadedChatTurn, dto: InferenceDTO): Promise<Model | null> {
  if (dto.model_id != null && dto.model_id.trim() !== "") {
    return ModelService.getModelForUser(ctx, user, dto.model_id);
  }
  if (chatTurn.modelResponse != null) return chatTurn.modelResponse.model;
  throw new IllegalStateException("No model provided and ChatTurn has no response.");
}

async function createOrUpdateModelResponse(
  ctx: Ctx,
  previousModelResponse: LoadedModelResponse | null,
  reply: string | null,
  thinking: string | null,
  model: Model,
  user: User,
  project: Project,
  monitoring: InferenceMonitoring | null,
): Promise<LoadedModelResponse> {
  const response = previousModelResponse ?? asLoadedModelResponse(ModelResponseEntity.create(), null);
  response.text = reply;
  response.thinking = thinking;
  response.model = model;
  response.modelId = model.id;
  response.userId = user.id;
  response.containerId = project.id;
  response.inferenceMonitoringId = monitoring ? monitoring.id : null;
  // setScores(new ArrayList<>()) / setHumanEvalScores(new ArrayList<>()) with orphanRemoval:
  // merging the response deleted its existing scores.
  if (response.id != null) {
    const [scores, humanScores] = await Promise.all([
      ScoreV2Repository.findByModelResponse_Id(ctx.db, response.id),
      HumanEvalScoreRepository.findByModelResponseId(ctx.db, response.id),
    ]);
    if (scores.length) await ScoreV2Repository.deleteAll(ctx.db, scores);
    for (const s of humanScores) await HumanEvalScoreRepository.delete(ctx.db, s);
  }
  await ModelResponseRepository.save(ctx.db, response);
  return response;
}

async function cleanupOrphanedEntities(ctx: Ctx, previousModelResponse: LoadedModelResponse | null, user: User): Promise<void> {
  if (previousModelResponse != null && !(await ChatTurnRepository.existsByModelResponse(ctx.db, previousModelResponse.id as string))) {
    // modelResponseService.deleteById(user, id)
    const mr = await ModelResponseRepository.findByUserAndId(ctx.db, user.id as string, previousModelResponse.id as string);
    if (!mr) throw new NotFoundException("ModelResponse not found");
    await ModelResponseRepository.delete(ctx.db, mr);
  }
}

function validatePrompts(prompts: Prompt[] | null | undefined): void {
  if (prompts == null) throw nullPointer();
  if (prompts.length === 0) throw new NotFoundException("At least 1 prompt is mandatory to run inference");
}

async function executeInferenceWithModel(
  ctx: Ctx,
  model: Model,
  user: User,
  chatPrompt: Prompt[],
  dto: InferenceDTO,
  chatTurn: LoadedChatTurn,
  project: Project,
  strategy?: ChatProviderStrategy,
): Promise<ChatResponseWithLatency | null> {
  const providerStrategy = strategy ?? (await ChatProviderFactory.getStrategy(ctx, model, user));
  try {
    return await providerStrategy.chat(chatPrompt);
  } catch (e) {
    console.error("Exception while communicating with LLM", e);
    dto.reason = errorMessage(e);
    const inferenceStatus = await InferenceStatusService.createOrUpdateInferenceStatus(ctx, dto, InferenceStatusEnum.FAILED);
    // modelResponseService.createModelResponse(user, project, model)
    const mr = asLoadedModelResponse(
      await ModelResponseRepository.save(
        ctx.db,
        ModelResponseEntity.create({ modelId: model.id, userId: user.id, containerId: project.id }),
      ),
      model,
    );
    chatTurn.modelResponse = mr;
    chatTurn.inferenceStatus = inferenceStatus;
    return null;
  }
}

async function saveSuccessfulInferenceResponse(
  ctx: Ctx,
  user: User,
  project: Project,
  model: Model,
  chatResponse: ChatResponseWithLatency,
  previousInferenceMonitoring: InferenceMonitoring | null,
  dto: InferenceDTO,
  chatTurn: LoadedChatTurn,
): Promise<InferenceMonitoring> {
  const inferenceMonitoring = await InferenceMonitoringService.saveInferenceMonitoring(
    ctx,
    user,
    chatResponse,
    model,
    project,
    previousInferenceMonitoring,
  );
  const modelResponse = asLoadedModelResponse(
    await ModelResponseRepository.save(
      ctx.db,
      ModelResponseEntity.create({
        text: chatResponse.reply,
        thinking: chatResponse.thinking,
        modelId: model.id,
        userId: user.id,
        containerId: project.id,
        inferenceMonitoringId: inferenceMonitoring.id,
      }),
    ),
    model,
  );
  const status = await InferenceStatusService.createOrUpdateInferenceStatus(ctx, dto, InferenceStatusEnum.SUCCESSFUL);
  if (chatTurn.inferenceStatus) Object.assign(chatTurn.inferenceStatus, status);
  await InferenceMonitoringService.save(ctx, inferenceMonitoring);
  chatTurn.modelResponse = modelResponse;
  return inferenceMonitoring;
}

async function getPreviousInferenceMonitoring(
  ctx: Ctx,
  previousChatTurns: LoadedChatTurn[] | null,
): Promise<InferenceMonitoring | null> {
  if (previousChatTurns != null && previousChatTurns.length) {
    const previousChatTurn = previousChatTurns[previousChatTurns.length - 1];
    const id = previousChatTurn?.modelResponse?.inferenceMonitoringId;
    if (id) return InferenceMonitoringRepository.findById(ctx.db, id);
  }
  return null;
}
