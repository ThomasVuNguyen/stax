/**
 * Port of domain/inference/service/PlaygroundInferenceService(+Impl).
 *
 * `allPrompts` is mutated (first ASSISTANT prompt removed) exactly like the Java list, which
 * callers that reuse the list (SxS continue) observed.
 *
 * Workers: no transaction. The model's deprecation and the provider strategy (API key) are
 * resolved right after the model lookup, before the first write, so that those errors do not
 * leave a half-built chat behind (Java rolled it back).
 */
import type { Ctx } from "../../../lib/ctx";
import { IllegalArgumentException, NotFoundException, RuntimeException } from "../../../lib/errors";
import * as ChatEntity from "../../../entities/Chat";
import type { EvaluationContainer } from "../../../entities/EvaluationContainer";
import * as ModelInputEntity from "../../../entities/ModelInput";
import * as ModelResponseEntity from "../../../entities/ModelResponse";
import type { Model } from "../../../entities/Model";
import type { Project } from "../../../entities/Project";
import type { User } from "../../../entities/User";
import { InputRole } from "../../../enums/InputRole";
import type { Prompt } from "../../../llmproviders/dto/Prompt";
import { containsVariableInput } from "../../../util/PromptUtil";
import * as ChatRepository from "../../chat/ChatRepository";
import * as ChatService from "../../chat/service/ChatService";
import type { ChatTurnDTO } from "../../chatturn/dto/ChatTurnDTO";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as ProjectService from "../../project/ProjectService";
import {
  type LoadedChat,
  type LoadedChatTurn,
  asLoadedModelResponse,
  getLatestTurn,
  loadChatTurn,
  loadChatTurnsOf,
  newChatTurn,
  saveChatTurn,
} from "./ChatTurnGraph";
import * as InferenceService from "./InferenceService";

export async function runInferenceWithConversation(
  ctx: Ctx,
  user: User,
  projectId: string,
  modelId: string,
  initialPreviousTurnId: string | null | undefined,
  allPrompts: Prompt[] | null | undefined,
  variables: Record<string, string> | null | undefined,
): Promise<ChatTurnDTO> {
  const project = await ProjectService.getProjectForUser(ctx, user, projectId);
  const pre = await InferenceService.preflight(ctx, user, modelId);
  const model = pre.model;
  const chat = await initializeChat(ctx, initialPreviousTurnId ?? null, user, project);
  const turns = chat.turns as LoadedChatTurn[];

  // When chatTurn is created from workbook page, user can just set modelId and run inference.
  if (allPrompts == null || allPrompts.length === 0) {
    // Java passes chat.getTurns() (which includes the latest turn) as the previous turns.
    const latest = getLatestTurn(chat);
    if (latest == null) throw new RuntimeException(`Cannot invoke "com.planck.planck.entitities.ChatTurn.getChat()" because "currentTurn" is null`);
    return InferenceService.addModelResponseToChatturn(ctx, user, project, modelId, turns, latest, pre);
  }

  await handleContinueFromWorkbookPage(ctx, user, allPrompts, project, model, chat);

  let sequenceId = turns.length ? Math.max(...turns.map((t) => t.sequenceId ?? 0)) + 1 : 0;

  if (variables != null && Object.keys(variables).length) {
    // Same managed Chat in Java: the merged variables are visible to the turns created below.
    chat.variables = (await ChatService.addOrUpdateVariables(ctx, chat.id as string, user, variables)).variables;
  }

  const promptsByTurn = splitPromptsByTurn(allPrompts);
  validatePromptsByTurn(promptsByTurn);

  const latestTurn = getLatestTurn(chat);
  if (latestTurn != null && latestTurn.inputs.length === 0 && promptsByTurn.length) {
    const completionPrompts = promptsByTurn[0];
    await completeTurnFromPrompts(ctx, latestTurn, user, project, completionPrompts, model);
    promptsByTurn.shift();
  }

  for (const turnPrompts of promptsByTurn) {
    await createTurnFromPrompts(ctx, chat, user, project, turnPrompts, sequenceId);
    sequenceId++;
  }

  const conversation = turns.length > 1 ? turns.slice(0, turns.length - 1) : [];
  const finalTurn = turns[turns.length - 1];
  return InferenceService.addModelResponseToChatturn(ctx, user, project, modelId, conversation, finalTurn, pre);
}

/**
 * This is an edge case, where a user creates a turn from the workbook page and then moves to the
 * prompt playground. The 1st turn is already created, but doesn't have a model response. Then the
 * user adds an Assistant message and continues from there, by also setting the ModelId. So this
 * method handles that scenario.
 */
async function handleContinueFromWorkbookPage(
  ctx: Ctx,
  user: User,
  allPrompts: Prompt[],
  project: Project,
  model: Model,
  chat: LoadedChat,
): Promise<void> {
  if (allPrompts[0].role !== InputRole.ASSISTANT) return;
  const latest = getLatestTurn(chat);
  if (latest == null) throw new RuntimeException(`Cannot invoke "com.planck.planck.entitities.ChatTurn.getModelResponse()" because the return value of "com.planck.planck.entitities.Chat.getLatestTurn()" is null`);
  let response = latest.modelResponse;
  if (response != null && response.text != null) {
    throw new IllegalArgumentException("Attempting to override existing model response is not allowed.");
  }
  if (response == null) {
    response = asLoadedModelResponse(
      ModelResponseEntity.create({ text: allPrompts[0].text, modelId: model.id, userId: user.id, containerId: project.id }),
      model,
    );
  } else {
    response.text = allPrompts[0].text;
  }
  await ModelResponseRepository.save(ctx.db, response);
  latest.modelResponse = response;
  await saveChatTurn(ctx, latest, user);
  allPrompts.shift();
}

function validatePromptsByTurn(promptsByTurn: Prompt[][]): void {
  if (promptsByTurn.length === 0) throw new IllegalArgumentException("Cannot run inference with an empty prompt list.");
  const lastTurn = promptsByTurn[promptsByTurn.length - 1];
  if (lastTurn.length === 0) throw new IllegalArgumentException("The final turn of prompts cannot be empty.");
  if (lastTurn[lastTurn.length - 1].role === InputRole.ASSISTANT) {
    throw new IllegalArgumentException("Cannot run inference on a turn that ends with an assistant message.");
  }
}

/** Returns the chat with its turns loaded (Chat.getTurns()). */
async function initializeChat(
  ctx: Ctx,
  previousTurnId: string | null,
  user: User,
  container: EvaluationContainer,
): Promise<LoadedChat> {
  if (previousTurnId == null) {
    // chatService.createChat(user, container)
    const chat: LoadedChat = await ChatRepository.save(ctx.db, ChatEntity.create({ containerId: container.id, userId: user.id }));
    chat.turns = [];
    return chat;
  }
  const previousTurn = await ChatTurnRepository.findByIdAndUser(ctx.db, previousTurnId, user.id as string);
  if (previousTurn == null) throw new NotFoundException(`Previous ChatTurn not found: ${previousTurnId}`);
  const chat = (await loadChatTurn(ctx.db, previousTurn)).chat;
  await loadChatTurnsOf(ctx.db, chat);
  return chat;
}

function splitPromptsByTurn(allPrompts: Prompt[]): Prompt[][] {
  const promptsByTurn: Prompt[][] = [];
  let currentTurn: Prompt[] = [];
  for (const prompt of allPrompts) {
    currentTurn.push(prompt);
    if (prompt.role === InputRole.ASSISTANT) {
      promptsByTurn.push(currentTurn);
      currentTurn = [];
    }
  }
  if (currentTurn.length) promptsByTurn.push(currentTurn);
  return promptsByTurn;
}

/** modelInputService.saveAll(user, prompts, variables): variables only on inputs that use them. */
function toInputs(user: User, prompts: Prompt[], variables: Record<string, string> | null) {
  return prompts.map((p) =>
    ModelInputEntity.fromPrompt(p, user.id, p.text != null && containsVariableInput(p.text) ? variables : null),
  );
}

async function createTurnFromPrompts(
  ctx: Ctx,
  chat: LoadedChat,
  user: User,
  project: Project,
  prompts: Prompt[],
  sequenceId: number,
): Promise<void> {
  const inputPrompts: Prompt[] = [];
  let assistantPrompt: Prompt | null = null;
  for (const prompt of prompts) {
    if (prompt.role === InputRole.ASSISTANT) assistantPrompt = prompt;
    else inputPrompts.push(prompt);
  }

  const turn = newChatTurn(chat, { inputs: toInputs(user, inputPrompts, chat.variables), userId: user.id, sequenceId });

  if (assistantPrompt != null) {
    const response = ModelResponseEntity.create({ text: assistantPrompt.text, modelId: null, userId: user.id, containerId: project.id });
    turn.modelResponse = asLoadedModelResponse(await ModelResponseRepository.save(ctx.db, response), null);
  }
  (chat.turns as LoadedChatTurn[]).push(turn);
  await saveChatTurn(ctx, turn, user);
}

async function completeTurnFromPrompts(
  ctx: Ctx,
  turnToComplete: LoadedChatTurn,
  user: User,
  project: Project,
  prompts: Prompt[],
  model: Model,
): Promise<void> {
  const inputPrompts: Prompt[] = [];
  let assistantPrompt: Prompt | null = null;
  for (const prompt of prompts) {
    if (prompt.role === InputRole.ASSISTANT) assistantPrompt = prompt;
    else inputPrompts.push(prompt);
  }

  if (inputPrompts.length) {
    turnToComplete.inputs.push(...toInputs(user, inputPrompts, turnToComplete.chat.variables));
  }

  if (assistantPrompt != null) {
    // Saved through the ChatTurn.modelResponse cascade (PERSIST) in Java.
    const response = ModelResponseEntity.create({ text: assistantPrompt.text, modelId: model.id, userId: user.id, containerId: project.id });
    turnToComplete.modelResponse = asLoadedModelResponse(await ModelResponseRepository.save(ctx.db, response), model);
  }

  await saveChatTurn(ctx, turnToComplete, user);
}
