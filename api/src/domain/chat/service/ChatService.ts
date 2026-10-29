/**
 * Port of domain/chat/service/ChatService + ChatServiceImpl.
 *
 * Conventions:
 * - Parameters mirror the Java signatures. A `user` parameter may be omitted (the current user,
 *   `requireUser(ctx)`, is used): a trailing one can simply be left out; for createChatTurn,
 *   updateTurn, fetchLastTurns and deleteTurnResults* the call without the user argument is
 *   recognised at runtime (by argument count, or because the first argument is a string id).
 * - Entities are flat; `EvaluationContainer` / `Chat` / `Model` parameters only need an `id`
 *   (plus `userId` / `containerType` where the Java code read them).
 * - Overloads: `getChat(ctx, chatId, user?, tagIds?)`; `createChatTurn` / `updateTurn` accept the
 *   prompt as a string (USER prompt) or a `Prompt`; `saveChat(ctx, turns[] | chat)`;
 *   `createChat(ctx, user, container)` / `createChat(ctx, id, container, user, variables?)`;
 *   `delete(ctx, turn | turns)` / `delete(ctx, user, turnId | turnIds)` (also exported as
 *   `deleteChatTurns`, `deleteById`, `deleteByIds`); `deleteChats(ctx, user, containerId)` /
 *   `deleteChats(ctx, chatIds, user, containerId)` (= `deleteChatsByIds`) / `deleteChats(ctx, chats)`.
 * - Saving a turn cascades like JPA when the turn object carries relations: `modelResponse`
 *   (saved first, with its `inferenceMonitoring` / `humanEvalScores` when present), `inputs`
 *   (turn_inputs) and `inferenceStatus` (see `ChatTurnWithRelations`).
 * - D1 has no transactions: multi-step writes run sequentially in FK order.
 */
import type { Ctx } from "../../../lib/ctx";
import { requireUser } from "../../../lib/ctx";
import { type Param, allIn, chunk, now, placeholders, stmt } from "../../../lib/db";
import {
  IllegalArgumentException,
  NotFoundException,
  ResourceLimitExceedException,
  RuntimeException,
  UserQuotaExceededException,
} from "../../../lib/errors";
import * as ChatEntity from "../../../entities/Chat";
import type { Chat } from "../../../entities/Chat";
import * as ChatTurnEntity from "../../../entities/ChatTurn";
import type { ChatTurn } from "../../../entities/ChatTurn";
import type { HumanEvaluator } from "../../../entities/HumanEvaluator";
import * as HumanEvalScoreEntity from "../../../entities/HumanEvalScore";
import type { HumanEvalScore } from "../../../entities/HumanEvalScore";
import type { InferenceMonitoring } from "../../../entities/InferenceMonitoring";
import type { InferenceStatus } from "../../../entities/InferenceStatus";
import type { Model } from "../../../entities/Model";
import * as ModelInputEntity from "../../../entities/ModelInput";
import type { ModelInput } from "../../../entities/ModelInput";
import * as ModelResponseEntity from "../../../entities/ModelResponse";
import type { ModelResponse } from "../../../entities/ModelResponse";
import { InputRole } from "../../../enums/InputRole";
import type { ModelProvider } from "../../../enums/ModelProvider";
import { ScopeType } from "../../../enums/ScopeType";
import { ScoringMechanismType } from "../../../enums/ScoringMechanismType";
import { getMaxVariableKeysPerChat } from "../../../config/ApplicationLimits";
import { getMaxChatsLimit } from "../../../config/ContainerLimitProvider";
import type { Prompt } from "../../../llmproviders/dto/Prompt";
import type { Page, Pageable } from "../../../util/Page";
import * as ChatRepository from "../ChatRepository";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import { type ChatTurnDTO, fromChatTurn, fromChatTurns } from "../../chatturn/dto/ChatTurnDTO";
import * as ModelInputRepository from "../../modelinput/ModelInputRepository";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as ModelRepository from "../../model/ModelRepository";
import * as ScoreV2Repository from "../../evaluation/ScoreV2Repository";
import * as SXSHumanFeedbackRepository from "../../evaluation/SXSHumanFeedbackRepository";
import * as HumanEvalScoreRepository from "../../evaluation/HumanEvalScoreRepository";
import * as InferenceMonitoringRepository from "../../inferencemonitoring/InferenceMonitoringRepository";
import * as InferenceStatusRepository from "../../inferencestatus/InferenceStatusRepository";
import * as EvaluationContainerRepository from "../../project/EvaluationContainerRepository";
import type { ChatTurnGroupCreateRequest } from "../../dataset/dto/ChatTurnGroupCreateRequest";
import type { RowCreateRequest } from "../../dataset/dto/RowCreateRequest";
import * as ModelService from "../../model/service/ModelService";
import * as HumanEvaluatorService from "../../evaluator/human/service/HumanEvaluatorService";

type UserRef = { id: string | null };
type ContainerRef = { id: string | null; userId?: string | null; containerType?: string | null };

/** A ChatTurn optionally carrying the relations JPA cascaded on save. */
export type ChatTurnWithRelations = ChatTurn & {
  inputs?: ModelInput[] | null;
  modelResponse?:
    | (ModelResponse & { inferenceMonitoring?: InferenceMonitoring | null; humanEvalScores?: HumanEvalScore[] | null })
    | null;
  inferenceStatus?: InferenceStatus | null;
};

const CHAT_TURN_LIMIT_EXCEEDED_MESSAGE = (id: string | null) => `Limit for DataSet with id: ${id} is exceeded.`;

/** In the positions where the user may be omitted the alternative argument is a string id. */
function isUser(x: unknown): x is UserRef {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
const uid = (user: UserRef): string => user.id as string;
const userOr = (ctx: Ctx, user: UserRef | null | undefined): UserRef => user ?? requireUser(ctx);
const ids = (xs: (string | null | undefined)[]): string[] => [
  ...new Set(xs.filter((x): x is string => x != null && x !== "")),
];

async function findContainer(ctx: Ctx, containerId: string) {
  const container = await EvaluationContainerRepository.findById(ctx.db, containerId);
  if (!container) throw new NotFoundException(`Container not found: ${containerId}`);
  return container;
}

async function runBatched(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

/** `UPDATE <table> SET <set> WHERE id IN (...)`, chunked. `setParams` are bound before the ids. */
function updateIn(db: D1Database, table: string, set: string, idList: string[], ...setParams: Param[]) {
  return chunk(idList, 90 - setParams.length).map((part) =>
    stmt(db, `UPDATE "${table}" SET ${set} WHERE id IN ${placeholders(part.length)}`, ...setParams, ...part),
  );
}

// ---------------------------------------------------------------------------------------------
// Reads

export async function getChatDTO(ctx: Ctx, chatId: string, user: UserRef, tagIds: string[] | null): Promise<ChatTurn[]> {
  const tagCount = tagIds != null ? tagIds.length : null;
  const chat = await ChatTurnRepository.findByChatIdAndUserIdOrderBySequenceId(ctx.db, chatId, uid(user), tagIds, tagCount);
  if (!chat.length) throw new IllegalArgumentException(`Chat not found for id: ${chatId}`);
  return chat;
}

export async function findChatsByUserAndIds(ctx: Ctx, chatIds: Iterable<string>, user?: UserRef): Promise<Chat[]> {
  return ChatRepository.findByUserAndIdIn(ctx.db, uid(userOr(ctx, user)), [...chatIds]);
}

/** `getChat(chatId, user)` / `getChat(chatId, user, tagIds)`: turns ordered by sequence, enriched. */
export async function getChat(
  ctx: Ctx,
  chatId: string,
  user?: UserRef | null,
  tagIds: string[] | null = null,
): Promise<ChatTurn[]> {
  const tagCount = tagIds != null ? tagIds.length : null;
  const result = await ChatTurnRepository.findByChatIdAndUserIdOrderBySequenceId(
    ctx.db,
    chatId,
    uid(userOr(ctx, user)),
    tagIds,
    tagCount,
  );
  await enrichTurnsWithSystemInstructions(ctx, result);
  return result;
}

export async function getChatUntilTurn(ctx: Ctx, chatId: string, turnId: string, user?: UserRef): Promise<ChatTurn[]> {
  const u = userOr(ctx, user);
  const targetTurn = await ChatTurnRepository.findByIdAndUser(ctx.db, turnId, uid(u));
  if (!targetTurn) throw new NotFoundException(`Turn not found with ID: ${turnId}`);
  if (targetTurn.chatId !== chatId) {
    throw new NotFoundException(`Turn ID ${turnId} does not belong to chat ID ${chatId}`);
  }
  const result = await ChatTurnRepository.findByChatIdAndUserIdUntilSequenceIdOrderBySequenceId(
    ctx.db,
    chatId,
    uid(u),
    targetTurn.sequenceId as number,
  );
  await enrichTurnsWithSystemInstructions(ctx, result);
  return result;
}

export async function getChatTurn(ctx: Ctx, chatTurnId: string, user?: UserRef): Promise<ChatTurn | null> {
  return ChatTurnRepository.findByIdAndUser(ctx.db, chatTurnId, uid(userOr(ctx, user)));
}

export async function getChatTurnDTO(ctx: Ctx, chatTurnId: string, user?: UserRef): Promise<ChatTurnDTO> {
  const turn = await getChatTurn(ctx, chatTurnId, user);
  if (!turn) {
    throw new RuntimeException('Cannot invoke "com.planck.planck.entitities.ChatTurn.getInputs()" because "chatTurn" is null');
  }
  return fromChatTurn(ctx.db, turn);
}

/** `fetchLastTurns(user, container, tagIds, pageable)`; the user may be omitted. */
export async function fetchLastTurns(
  ctx: Ctx,
  ...args: [UserRef, ContainerRef, string[] | null, Pageable] | [ContainerRef, string[] | null, Pageable]
): Promise<Page<ChatTurn>> {
  const [user, container, tagIds, pageable] = (
    args.length === 4 ? args : [requireUser(ctx), ...args]
  ) as [UserRef, ContainerRef, string[] | null, Pageable];
  const tagCount = tagIds != null ? tagIds.length : 0;
  const result = await ChatTurnRepository.findLatestChatTurnsByUser(
    ctx.db,
    uid(user),
    container.id as string,
    tagIds,
    tagCount,
    pageable,
  );
  await enrichTurnsWithSystemInstructions(ctx, result.content);
  return result;
}

export async function getChatTurnsByList(ctx: Ctx, chatTurnIds: string[], user?: UserRef): Promise<ChatTurn[]> {
  return ChatTurnRepository.findChatTurnsByList(ctx.db, chatTurnIds, uid(userOr(ctx, user)));
}

export async function getChatTurnsByChatIdList(ctx: Ctx, chatIds: string[], user?: UserRef): Promise<ChatTurn[]> {
  return ChatTurnRepository.findChatTurnsByChatList(ctx.db, chatIds, uid(userOr(ctx, user)));
}

export async function findMaxSequenceIdByUserAndContainerAndChatId(
  ctx: Ctx,
  user: UserRef,
  chatId: string,
  container: ContainerRef,
): Promise<number | null> {
  return ChatTurnRepository.findMaxSequenceIdByUserAndContainerAndChatId(ctx.db, uid(user), container.id as string, chatId);
}

export async function findAllByUserAndChatContainer(ctx: Ctx, user: UserRef, container: ContainerRef): Promise<ChatTurn[]> {
  return ChatTurnRepository.findAllByUserAndChatContainer(ctx.db, uid(user), container.id as string);
}

export async function findLatestChatTurnIdsByProjectId(ctx: Ctx, projectId: string, user?: UserRef): Promise<string[]> {
  return ChatTurnRepository.findLatestChatTurnIdsByContainerId(ctx.db, projectId, uid(userOr(ctx, user)));
}

export async function existsByModelResponse(ctx: Ctx, modelResponse: { id: string | null }): Promise<boolean> {
  return ChatTurnRepository.existsByModelResponse(ctx.db, modelResponse.id as string);
}

export async function findIdsWithNonEmptyOutput(ctx: Ctx, chatTurnIds: string[]): Promise<string[]> {
  return ChatTurnRepository.findIdsWithNonEmptyModelResponse(ctx.db, chatTurnIds);
}

export async function getChatById(ctx: Ctx, chatId: string, user?: UserRef): Promise<Chat> {
  const chat = await ChatRepository.findByIdAndUser(ctx.db, chatId, uid(userOr(ctx, user)));
  if (!chat) throw new NotFoundException(`Chat not found: ${chatId}`);
  return chat;
}

/** Optional<Chat> → Chat | null. */
export async function findByChatId(ctx: Ctx, chatId: string, user?: UserRef): Promise<Chat | null> {
  return ChatRepository.findByIdAndUser(ctx.db, chatId, uid(userOr(ctx, user)));
}

export async function getAllChatsByUser(ctx: Ctx, user?: UserRef): Promise<Chat[]> {
  return ChatRepository.findAllByUser(ctx.db, uid(userOr(ctx, user)));
}

export async function getAllChatsByContainer(ctx: Ctx, container: ContainerRef): Promise<Chat[]> {
  return ChatRepository.findAllByContainer(ctx.db, container.id as string);
}

export async function getDistinctModelProvidersByProject(ctx: Ctx, user: UserRef, projectId: string): Promise<ModelProvider[]> {
  return ChatTurnRepository.findDistinctModelProvidersByContainerId(ctx.db, projectId, uid(user));
}

export async function getAllChatIds(ctx: Ctx, user: UserRef, container: ContainerRef): Promise<string[]> {
  return ChatTurnRepository.findAllChatIdsByUserAndContainer(ctx.db, uid(user), container.id as string);
}

export async function getFullChatHistory(ctx: Ctx, anyTurnInChat: ChatTurn | null): Promise<ChatTurn[]> {
  if (!anyTurnInChat || !anyTurnInChat.chatId) return [];
  const chat = await ChatRepository.findById(ctx.db, anyTurnInChat.chatId);
  if (!chat) return [];
  return ChatTurnRepository.findByChatIdAndContainerAndUserIdOrderBySequenceId(
    ctx.db,
    chat.id as string,
    chat.containerId as string,
    anyTurnInChat.userId as string,
  );
}

/** Optional<Model> → Model | null: the model of the first turn whose response has one. */
export async function getModelFromChatHistory(ctx: Ctx, chatHistory: ChatTurn[]): Promise<Model | null> {
  const responses = new Map(
    (await ModelResponseRepository.findAllById(ctx.db, ids(chatHistory.map((t) => t.modelResponseId)))).map((r) => [r.id, r]),
  );
  for (const turn of chatHistory) {
    const modelId = turn.modelResponseId ? responses.get(turn.modelResponseId)?.modelId : null;
    if (modelId) {
      const model = await ModelRepository.findById(ctx.db, modelId);
      if (model) return model;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// System instructions

/** Sets `effectiveSystemInstruction` on each turn: the latest SYSTEM input of its chat created at or before it. */
export async function enrichTurnsWithSystemInstructions(ctx: Ctx, turns: ChatTurn[] | null): Promise<void> {
  if (!turns || !turns.length) return;
  const chatIds = ids(turns.map((t) => t.chatId));
  const instructions = await ChatTurnRepository.findSystemInstructionTurnsInChats(ctx.db, chatIds);
  if (!instructions.length) return;
  const inputs = await ChatTurnRepository.findInputsByTurnIds(ctx.db, ids(instructions.map((t) => t.id)));

  // TreeMap<createdAt, text> per chat (a later duplicate key replaces the earlier one).
  const timelines = new Map<string, Map<string, string>>();
  for (const inst of instructions) {
    const timeline = timelines.get(inst.chatId as string) ?? new Map<string, string>();
    const text = (inputs.get(inst.id as string) ?? []).find((i) => i.role === InputRole.SYSTEM)?.text ?? "";
    timeline.set(inst.createdAt as string, text);
    timelines.set(inst.chatId as string, timeline);
  }
  const sorted = new Map([...timelines].map(([chatId, tl]) => [chatId, [...tl].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]));

  for (const turn of turns) {
    const timeline = sorted.get(turn.chatId as string);
    if (!timeline || turn.createdAt == null) continue;
    let floor: string | undefined;
    for (const [createdAt, text] of timeline) {
      if (createdAt <= turn.createdAt) floor = text;
      else break;
    }
    if (floor !== undefined) turn.effectiveSystemInstruction = floor;
  }
}

// ---------------------------------------------------------------------------------------------
// Chats

function buildChat(id: string | null, user: UserRef, variables: Record<string, string> | null, container: ContainerRef): Chat {
  const chat = ChatEntity.create({ containerId: container.id, userId: user.id });
  chat.id = id ?? ChatEntity.ID_PREFIX + crypto.randomUUID();
  if (variables != null) chat.variables = variables;
  return chat;
}

export function createChat(ctx: Ctx, user: UserRef, container: ContainerRef): Promise<Chat>;
export function createChat(
  ctx: Ctx,
  id: string | null,
  container: ContainerRef,
  user: UserRef,
  variables?: Record<string, string> | null,
): Promise<Chat>;
export async function createChat(
  ctx: Ctx,
  userOrId: UserRef | string | null,
  container: ContainerRef,
  user?: UserRef,
  variables: Record<string, string> | null = null,
): Promise<Chat> {
  const chat =
    typeof userOrId === "object" && userOrId !== null
      ? buildChat(null, userOrId, null, container)
      : buildChat(userOrId, userOr(ctx, user), variables, container);
  return ChatRepository.save(ctx.db, chat);
}

export async function deleteChat(ctx: Ctx, chatId: string, user?: UserRef): Promise<void> {
  await ChatRepository.delete(ctx.db, await getChatById(ctx, chatId, user));
}

/** `chatTurn.setChat(chat); chat.getTurns().add(chatTurn); chatRepository.save(chat)` (cascade to the turn). */
export async function addChatTurn(ctx: Ctx, chat: Chat, chatTurn: ChatTurnWithRelations): Promise<void> {
  chatTurn.chatId = chat.id;
  await ChatRepository.save(ctx.db, chat);
  await saveTurnsCascade(ctx, [chatTurn]);
}

/** `saveChat(List<ChatTurn>)` (saveAllAndFlush with cascades) or `saveChat(Chat)`. */
export function saveChat(ctx: Ctx, chatTurns: ChatTurnWithRelations[]): Promise<ChatTurn[]>;
export function saveChat(ctx: Ctx, chat: Chat): Promise<Chat>;
export async function saveChat(ctx: Ctx, arg: ChatTurnWithRelations[] | Chat): Promise<ChatTurn[] | Chat> {
  if (Array.isArray(arg)) return saveTurnsCascade(ctx, arg);
  return ChatRepository.save(ctx.db, arg);
}

// --- variables

function variablesLimitError(): UserQuotaExceededException {
  return new UserQuotaExceededException(
    `Exceeded variables key limit. Maximum allowed is ${getMaxVariableKeysPerChat()}.`,
  );
}

export async function replaceVariables(
  ctx: Ctx,
  chatId: string,
  user: UserRef,
  newVariables: Record<string, string>,
): Promise<Chat> {
  if (Object.keys(newVariables).length > getMaxVariableKeysPerChat()) throw variablesLimitError();
  const chat = await getChatById(ctx, chatId, user);
  chat.variables = newVariables;
  return ChatRepository.save(ctx.db, chat);
}

export async function addOrUpdateVariables(
  ctx: Ctx,
  chatId: string,
  user: UserRef,
  variablesUpdates: Record<string, string> | null,
): Promise<Chat> {
  const chat = await getChatById(ctx, chatId, user);
  if (!variablesUpdates || !Object.keys(variablesUpdates).length) return chat;
  const current = chat.variables ?? {};
  const newKeys = Object.keys(variablesUpdates).filter((k) => !(k in current)).length;
  if (Object.keys(current).length + newKeys > getMaxVariableKeysPerChat()) throw variablesLimitError();
  chat.variables = { ...current, ...variablesUpdates };
  return ChatRepository.save(ctx.db, chat);
}

export async function removeVariablesKey(ctx: Ctx, chatId: string, user: UserRef, key: string): Promise<Chat> {
  const chat = await getChatById(ctx, chatId, user);
  const current = chat.variables;
  if (current != null && Object.prototype.hasOwnProperty.call(current, key)) {
    const { [key]: _removed, ...rest } = current;
    chat.variables = rest;
    return ChatRepository.save(ctx.db, chat);
  }
  return chat;
}

export async function getVariables(ctx: Ctx, chatId: string, user: UserRef): Promise<Record<string, string>> {
  return (await getChatById(ctx, chatId, user)).variables ?? {};
}

export async function getVariablesKeys(ctx: Ctx, chatId: string, user: UserRef): Promise<string[]> {
  return Object.keys((await getChatById(ctx, chatId, user)).variables ?? {});
}

// ---------------------------------------------------------------------------------------------
// Turn creation / update

function toPrompt(prompt: string | Prompt | null | undefined, emptyIsNull: boolean): Prompt | null {
  if (prompt == null) return null;
  if (typeof prompt === "string") {
    if (emptyIsNull && prompt === "") return null;
    return { role: InputRole.USER, text: prompt };
  }
  return prompt;
}

/**
 * `createChatTurn(user, containerId, chatId, modelPrompt | prompt, modelResponseText, modelId)`.
 * The user argument may be omitted.
 */
export async function createChatTurn(
  ctx: Ctx,
  ...args:
    | [UserRef, string, string | null, string | Prompt | null, string | null, string | null]
    | [string, string | null, string | Prompt | null, string | null, string | null]
): Promise<ChatTurn> {
  const [user, containerId, chatId, rawPrompt, modelResponseText, modelId] = (
    isUser(args[0]) ? args : [requireUser(ctx), ...args]
  ) as [UserRef, string, string | null, string | Prompt | null, string | null, string | null];
  const prompt = toPrompt(rawPrompt, true);

  const container = await findContainer(ctx, containerId);
  if (container.userId !== user.id) {
    // java.lang.SecurityException → RuntimeException handler.
    throw new RuntimeException("User does not have access to this container.");
  }

  let modelResponse: ModelResponse | null = null;
  if (modelId != null && modelId !== "") {
    const model = await ModelService.getModelForUser(ctx, user, modelId);
    modelResponse = ModelResponseEntity.create({ modelId: model.id, userId: user.id });
    if (modelResponseText != null) modelResponse.text = modelResponseText;
    modelResponse = await ModelResponseRepository.save(ctx.db, modelResponse);
  }

  let chat: Chat;
  let sequenceId = 0;
  if (chatId == null || chatId === "") {
    chat = await createChat(ctx, user, container);
  } else {
    chat = await getChatById(ctx, chatId, user);
    const maxSequence = await findMaxSequenceIdByUserAndContainerAndChatId(ctx, user, chat.id as string, container);
    sequenceId = maxSequence != null ? maxSequence + 1 : 0;
  }

  const input = prompt != null ? ModelInputEntity.fromPrompt(prompt, user.id) : null;
  const chatTurn: ChatTurnWithRelations = ChatTurnEntity.create({
    userId: user.id,
    chatId: chat.id,
    sequenceId,
    modelResponseId: modelResponse?.id ?? null,
  });
  chatTurn.inputs = input ? [input] : [];

  const count = await ChatTurnRepository.countDistinctChatIdsByContainer(ctx.db, container.id as string, uid(user));
  if (count >= getMaxChatsLimit(container)) {
    throw new UserQuotaExceededException("Max Quota Reached for this container.");
  }
  const [saved] = await saveTurnsCascade(ctx, [chatTurn]);
  return saved;
}

/**
 * `updateTurn(user, containerId, chatTurnId, modelPrompt | prompt, modelResponse, modelId, expectedOutput)`.
 * The user argument may be omitted.
 */
export async function updateTurn(
  ctx: Ctx,
  ...args:
    | [UserRef, string, string, string | Prompt | null, string | null, string | null, string | null]
    | [string, string, string | Prompt | null, string | null, string | null, string | null]
): Promise<ChatTurn> {
  const [user, containerId, chatTurnId, rawPrompt, modelResponse, modelId, expectedOutput] = (
    isUser(args[0]) ? args : [requireUser(ctx), ...args]
  ) as [UserRef, string, string, string | Prompt | null, string | null, string | null, string | null];
  const prompt = toPrompt(rawPrompt, false);

  const chatTurn = await ChatTurnRepository.findByIdAndUser(ctx.db, chatTurnId, uid(user));
  if (!chatTurn) throw new NotFoundException(`Chat Turn not found: ${chatTurnId}`);
  const chat = chatTurn.chatId ? await ChatRepository.findById(ctx.db, chatTurn.chatId) : null;
  if (!chat || chat.containerId !== containerId) {
    throw new NotFoundException("ChatTurn not found for the provided container");
  }

  await updatePromptIfNeeded(ctx, chatTurn, user, prompt, expectedOutput);
  await updateModelResponseIfNeeded(ctx, chatTurn, user, modelResponse, modelId);
  return ChatTurnRepository.save(ctx.db, chatTurn);
}

async function updatePromptIfNeeded(
  ctx: Ctx,
  chatTurn: ChatTurn,
  user: UserRef,
  prompt: Prompt | null,
  expectedOutput: string | null,
): Promise<void> {
  if (prompt == null && expectedOutput == null) return;
  const inputs = await ChatTurnRepository.findInputsByTurnId(ctx.db, chatTurn.id as string);

  let input: ModelInput | null = prompt != null ? (inputs.find((mi) => mi.role === prompt.role) ?? null) : null;
  let added = false;
  if (input == null && prompt != null) {
    input = ModelInputEntity.fromPrompt(prompt, user.id);
    inputs.push(input);
    added = true;
  }
  if (input != null) {
    if (prompt != null) input.text = prompt.text;
    if (expectedOutput != null) input.expectedOutput = expectedOutput;
    if (added) await ChatTurnRepository.saveInputs(ctx.db, chatTurn.id as string, inputs);
    else await ModelInputRepository.save(ctx.db, input);
  }
}

async function updateModelResponseIfNeeded(
  ctx: Ctx,
  chatTurn: ChatTurn,
  user: UserRef,
  modelResponse: string | null,
  modelId: string | null,
): Promise<void> {
  if (modelResponse == null && modelId == null) return;
  let response = chatTurn.modelResponseId ? await ModelResponseRepository.findById(ctx.db, chatTurn.modelResponseId) : null;
  if (!response) response = ModelResponseEntity.create({ userId: user.id });
  if (modelId != null) {
    const model = await ModelService.getModelForUser(ctx, user, modelId);
    response.modelId = model.id;
  }
  if (modelResponse != null) response.text = modelResponse;
  await ModelResponseRepository.save(ctx.db, response);
  chatTurn.modelResponseId = response.id;
}

export async function saveChatTurn(ctx: Ctx, chatTurn: ChatTurnWithRelations, user?: UserRef): Promise<ChatTurn> {
  const u = userOr(ctx, user);
  const chat = chatTurn.chatId ? await ChatRepository.findById(ctx.db, chatTurn.chatId) : null;
  const container = chat?.containerId ? await EvaluationContainerRepository.findById(ctx.db, chat.containerId) : null;
  if (!container) {
    throw new IllegalArgumentException("ChatTurn must belong to a Chat that is linked to a Container.");
  }
  const maxChatsInContainer = getMaxChatsLimit(container);
  const count = await ChatTurnRepository.countDistinctChatIdsByContainer(ctx.db, container.id as string, uid(u));
  if ((await ChatTurnRepository.countByChat(ctx.db, chat!.id as string)) <= 1 && count >= maxChatsInContainer) {
    throw new UserQuotaExceededException(
      `Max Quota Reached (${maxChatsInContainer.toLocaleString("en-US")}) for this container.`,
    );
  }
  const [saved] = await saveTurnsCascade(ctx, [chatTurn]);
  return saved;
}

/**
 * chatTurnRepository.save/saveAll with ChatTurn's JPA cascades: modelResponse (PERSIST/MERGE, and
 * its own cascades), inputs (PERSIST/MERGE through turn_inputs) and inferenceStatus (ALL).
 * Relations that are absent (`undefined`) are left untouched.
 */
async function saveTurnsCascade<T extends ChatTurnWithRelations>(ctx: Ctx, turns: T[]): Promise<T[]> {
  const db = ctx.db;
  const responses = turns.map((t) => t.modelResponse).filter((r): r is NonNullable<typeof r> => r != null);
  const monitorings = responses.map((r) => r.inferenceMonitoring).filter((m): m is InferenceMonitoring => m != null);
  if (monitorings.length) await InferenceMonitoringRepository.saveAll(db, monitorings);
  for (const r of responses) if (r.inferenceMonitoring) r.inferenceMonitoringId = r.inferenceMonitoring.id;
  if (responses.length) await ModelResponseRepository.saveAll(db, [...new Set(responses)]);
  const humanScores: HumanEvalScore[] = [];
  for (const r of responses) {
    for (const s of r.humanEvalScores ?? []) {
      s.modelResponseId = r.id;
      humanScores.push(s);
    }
  }
  if (humanScores.length) await HumanEvalScoreRepository.saveAll(db, humanScores);

  for (const t of turns) {
    if (t.modelResponse !== undefined) t.modelResponseId = t.modelResponse?.id ?? null;
  }
  await ChatTurnRepository.saveAll(db, turns);

  const inputStmts = turns
    .filter((t) => t.inputs != null)
    .flatMap((t) => ChatTurnRepository.saveInputsStmts(db, t.id as string, t.inputs as ModelInput[]));
  await runBatched(db, inputStmts);

  const statuses = turns
    .filter((t) => t.inferenceStatus != null)
    .map((t) => {
      const s = t.inferenceStatus as InferenceStatus;
      s.chatTurnId = t.id;
      return s;
    });
  if (statuses.length) await InferenceStatusRepository.saveAll(db, statuses);
  return turns;
}

// ---------------------------------------------------------------------------------------------
// Duplication

type TurnWithGraph = ChatTurn & { inputs: ModelInput[]; modelResponse: ModelResponse | null };

/** Loads the inputs and the model response of each turn (the EAGER relations used when copying). */
async function withInputsAndResponses(ctx: Ctx, turns: ChatTurn[]): Promise<TurnWithGraph[]> {
  const inputs = await ChatTurnRepository.findInputsByTurnIds(ctx.db, ids(turns.map((t) => t.id)));
  const responses = new Map(
    (await ModelResponseRepository.findAllById(ctx.db, ids(turns.map((t) => t.modelResponseId)))).map((r) => [r.id, r]),
  );
  return turns.map((t) => ({
    ...t,
    inputs: (t.id && inputs.get(t.id)) || [],
    modelResponse: (t.modelResponseId && responses.get(t.modelResponseId)) || null,
  }));
}

type NewTurn = ChatTurn & { inputs: ModelInput[]; modelResponse: ModelResponse | null };

async function duplicateChatTurns(
  ctx: Ctx,
  container: ContainerRef,
  existingChatTurns: TurnWithGraph[],
  user: UserRef,
  variables: Record<string, string> | null,
  responseCreationStrategy: (turn: TurnWithGraph) => ModelResponse | null,
): Promise<Chat & { turns: NewTurn[] }> {
  const newChat = await createChat(ctx, user, container);
  newChat.variables = variables;

  const newTurns: NewTurn[] = existingChatTurns.map((original) => {
    const t = now();
    return {
      ...ChatTurnEntity.create({
        chatId: newChat.id,
        userId: original.userId,
        sequenceId: original.sequenceId,
        createdAt: t,
        updatedAt: t,
      }),
      inputs: original.inputs.map(ModelInputEntity.deepCopy),
      modelResponse: responseCreationStrategy(original),
    };
  });

  await ModelInputRepository.saveAll(ctx.db, newTurns.flatMap((t) => t.inputs));
  // Responses that already exist (shared with the source chat) are merged unchanged in Java.
  const newResponses = [...new Set(newTurns.map((t) => t.modelResponse).filter((r): r is ModelResponse => r != null))];
  await ModelResponseRepository.saveAll(ctx.db, newResponses.filter((r) => r.id == null));
  for (const t of newTurns) t.modelResponseId = t.modelResponse?.id ?? null;

  await ChatRepository.save(ctx.db, newChat);
  await ChatTurnRepository.saveAll(ctx.db, newTurns);
  await runBatched(
    ctx.db,
    newTurns.flatMap((t) => ChatTurnRepository.saveInputsStmts(ctx.db, t.id as string, t.inputs)),
  );
  return { ...newChat, turns: newTurns };
}

async function duplicateChatInternal(
  ctx: Ctx,
  existingChatTurn: ChatTurn,
  strategy: (turn: TurnWithGraph) => ModelResponse | null,
): Promise<NewTurn[]> {
  const chat = await ChatRepository.findById(ctx.db, existingChatTurn.chatId as string);
  const existing = await withInputsAndResponses(
    ctx,
    await ChatTurnRepository.findChatTillSequence(
      ctx.db,
      existingChatTurn.chatId as string,
      existingChatTurn.sequenceId as number,
      existingChatTurn.userId as string,
    ),
  );
  const result = await duplicateChatTurns(
    ctx,
    { id: chat?.containerId ?? null },
    existing,
    { id: existingChatTurn.userId },
    chat?.variables ?? null,
    strategy,
  );
  return result.turns;
}

const copyOf = (r: ModelResponse | null): ModelResponse | null => (r ? ModelResponseEntity.deepCopy(r, r.containerId) : null);

/** New chat with copies of the turns up to `existingChatTurn` (responses deep-copied). */
export async function duplicateChat(ctx: Ctx, existingChatTurn: ChatTurn): Promise<NewTurn[]> {
  return duplicateChatInternal(ctx, existingChatTurn, (t) => copyOf(t.modelResponse));
}

/** Like duplicateChat, but the copied responses use `model` and the last turn gets a new empty response. */
export async function duplicateChatNewLastModelResponse(
  ctx: Ctx,
  existingChatTurn: ChatTurn,
  model: { id: string | null },
): Promise<NewTurn[]> {
  const maxSequence = existingChatTurn.sequenceId;
  const newFinalResponse = await ModelResponseRepository.save(
    ctx.db,
    ModelResponseEntity.create({ modelId: model.id, userId: existingChatTurn.userId }),
  );
  return duplicateChatInternal(ctx, existingChatTurn, (t) => {
    if (t.sequenceId === maxSequence) return newFinalResponse;
    const copied = copyOf(t.modelResponse);
    if (copied) copied.modelId = model.id;
    return copied;
  });
}

export async function duplicateChatWithNewModel(
  ctx: Ctx,
  existingChatTurn: ChatTurn,
  newModel: { id: string | null },
): Promise<NewTurn[]> {
  return duplicateChatInternal(ctx, existingChatTurn, (t) => {
    const copied = copyOf(t.modelResponse);
    if (copied) copied.modelId = newModel.id;
    return copied;
  });
}

/**
 * For each chat, a new chat with the same turns; the last turn (max sequence) gets no response and
 * the other turns share the source turn's response (not copied). Keyed by source chat id.
 */
export async function duplicateChatsForSideB(
  ctx: Ctx,
  chats: Chat[],
  _user?: UserRef,
): Promise<Map<string, Chat & { turns: NewTurn[] }>> {
  const newChats = new Map<string, Chat & { turns: NewTurn[] }>();
  const allTurns = await ChatTurnRepository.findByChatIn(ctx.db, ids(chats.map((c) => c.id)));
  for (const chat of chats) {
    const turns = await withInputsAndResponses(
      ctx,
      allTurns.filter((t) => t.chatId === chat.id).sort((a, b) => (a.sequenceId ?? 0) - (b.sequenceId ?? 0)),
    );
    const maxSequence = turns.length ? Math.max(...turns.map((t) => t.sequenceId ?? 0)) : 0;
    newChats.set(
      chat.id as string,
      await duplicateChatTurns(ctx, { id: chat.containerId }, turns, { id: chat.userId }, chat.variables, (t) =>
        t.sequenceId === maxSequence ? null : t.modelResponse,
      ),
    );
  }
  return newChats;
}

/** Appends copies of `sourceTurns[startIndex..]` to `destinationChat`; returns the last new turn. */
export async function appendMissingTurns(
  ctx: Ctx,
  destinationChat: Chat | null,
  sourceTurns: ChatTurn[],
  container: ContainerRef | null,
  startIndex: number,
): Promise<ChatTurn> {
  if (startIndex < sourceTurns.length && (!destinationChat || !container)) {
    // Java dereferenced both while copying the first turn.
    throw new RuntimeException(`Cannot invoke a method on a null ${destinationChat ? "container" : "destination chat"}`);
  }
  const sources = await withInputsAndResponses(ctx, sourceTurns.slice(startIndex));
  const turnsToCreate: NewTurn[] = sources.map((source) => {
    let newResponse: ModelResponse | null = null;
    if (source.modelResponse) {
      newResponse = ModelResponseEntity.deepCopy(source.modelResponse, container!.id);
      newResponse.modelId = null; // createNewTurnFromSource(..., model = null)
    }
    return {
      ...ChatTurnEntity.create({ chatId: destinationChat!.id, userId: container!.userId ?? null, sequenceId: source.sequenceId }),
      inputs: source.inputs.map(ModelInputEntity.deepCopy),
      modelResponse: newResponse,
    };
  });

  // saveTurnsInBatch
  await ModelInputRepository.saveAll(ctx.db, turnsToCreate.flatMap((t) => t.inputs));
  await ModelResponseRepository.saveAll(ctx.db, turnsToCreate.map((t) => t.modelResponse).filter((r): r is ModelResponse => r != null));
  for (const t of turnsToCreate) t.modelResponseId = t.modelResponse?.id ?? null;
  await ChatTurnRepository.saveAll(ctx.db, turnsToCreate);
  await runBatched(ctx.db, turnsToCreate.flatMap((t) => ChatTurnRepository.saveInputsStmts(ctx.db, t.id as string, t.inputs)));

  if (!turnsToCreate.length) {
    throw new RuntimeException("Index -1 out of bounds for length 0");
  }
  return turnsToCreate[turnsToCreate.length - 1];
}

/** Copies the source turn's response (without model) onto the destination turn unless it already has text. */
export async function copyResponseToTurn(
  ctx: Ctx,
  sourceTurn: ChatTurn,
  destinationTurn: ChatTurn,
  _modelForDestination: unknown,
): Promise<void> {
  const original = sourceTurn.modelResponseId ? await ModelResponseRepository.findById(ctx.db, sourceTurn.modelResponseId) : null;
  // java.lang.IllegalStateException → RuntimeException handler.
  if (!original) throw new RuntimeException("Source turn has no response to copy.");
  const destination = destinationTurn.modelResponseId
    ? await ModelResponseRepository.findById(ctx.db, destinationTurn.modelResponseId)
    : null;
  if (destination && destination.text != null) return;

  const copied = ModelResponseEntity.deepCopy(original, original.containerId);
  copied.modelId = null;
  await ModelResponseRepository.save(ctx.db, copied);
  destinationTurn.modelResponseId = copied.id;
  await ChatTurnRepository.save(ctx.db, destinationTurn);
}

// ---------------------------------------------------------------------------------------------
// Deletion

/** `delete(List<ChatTurn>)`: removes turns with their scores, statuses, orphaned responses/inputs/chats. */
export async function deleteChatTurns(ctx: Ctx, chatTurns: ChatTurn[]): Promise<void> {
  if (!chatTurns.length) return;
  const db = ctx.db;
  const turnIds = ids(chatTurns.map((t) => t.id));
  const responseIds = ids(chatTurns.map((t) => t.modelResponseId));
  const [responses, scoresByResponse, inputsByTurn] = await Promise.all([
    ModelResponseRepository.findAllById(db, responseIds),
    ModelResponseRepository.findScoresByModelResponseIds(db, responseIds),
    ChatTurnRepository.findInputsByTurnIds(db, turnIds),
  ]);
  const allScores = [...scoresByResponse.values()].flat();
  const candidateInputIds = ids([...inputsByTurn.values()].flat().map((i) => i.id));
  const candidateChatIds = ids(chatTurns.map((t) => t.chatId));
  const ts = now();

  // Detach: clear inputs / inference status / response of the turns, null the monitoring containers.
  const detach: D1PreparedStatement[] = [
    ...updateIn(db, "evaluation_monitoring", "container_id = NULL, updated_at = ?", ids(allScores.map((s) => s.evaluationMonitoringId)), ts),
    ...updateIn(db, "inference_monitoring", "container_id = NULL, updated_at = ?", ids(responses.map((r) => r.inferenceMonitoringId)), ts),
    ...chunk(turnIds).flatMap((part) => [
      stmt(db, `DELETE FROM turn_inputs WHERE turn_id IN ${placeholders(part.length)}`, ...part),
      stmt(db, `DELETE FROM inference_status WHERE chat_turn_id IN ${placeholders(part.length)}`, ...part),
    ]),
    ...updateIn(db, "chat_turns", "model_response_id = NULL, updated_at = ?", turnIds, ts),
  ];
  await runBatched(db, detach);
  for (const t of chatTurns) t.modelResponseId = null;

  if (allScores.length) await ScoreV2Repository.deleteAll(db, allScores);

  const stillUsed = new Set(
    (await allIn<{ id: string }>(
      db,
      (inn) => `SELECT DISTINCT model_response_id AS id FROM chat_turns WHERE model_response_id IN ${inn}`,
      responseIds,
    )).map((r) => r.id),
  );
  await ModelResponseRepository.deleteAllById(db, responseIds.filter((id) => !stillUsed.has(id)));

  const used = new Set((await ChatTurnRepository.countUsagesForInputs(db, candidateInputIds)).map((u) => u.inputId));
  const unusedInputs = candidateInputIds.filter((id) => !used.has(id));
  await runBatched(
    db,
    chunk(unusedInputs).map((part) => stmt(db, `DELETE FROM model_input WHERE id IN ${placeholders(part.length)}`, ...part)),
  );

  await ChatTurnRepository.deleteAllById(db, turnIds);

  for (const chatId of candidateChatIds) {
    if ((await ChatTurnRepository.countByChat(db, chatId)) === 0) await ChatRepository.deleteById(db, chatId);
  }
}

/** `delete(User, String)`: the turn must exist and belong to the user. */
export async function deleteById(ctx: Ctx, user: UserRef, chatTurnId: string): Promise<void> {
  const chatTurn = await ChatTurnRepository.findById(ctx.db, chatTurnId);
  if (!chatTurn) throw new NotFoundException(`ChatTurn not found: ${chatTurnId}`);
  if (chatTurn.userId !== user.id) throw new NotFoundException("ChatTurn does not belong to the user");
  await deleteChatTurns(ctx, [chatTurn]);
}

/** `delete(User, List<String>)`: deletes the user's turns among `chatTurnIds`. */
export async function deleteByIds(ctx: Ctx, user: UserRef, chatTurnIds: string[] | null): Promise<void> {
  if (!chatTurnIds || !chatTurnIds.length) return;
  const turns = (await ChatTurnRepository.findAllById(ctx.db, chatTurnIds)).filter((t) => t.userId === user.id);
  await deleteChatTurns(ctx, turns);
}

function delete_(ctx: Ctx, chatTurns: ChatTurn[]): Promise<void>;
function delete_(ctx: Ctx, chatTurn: ChatTurn): Promise<void>;
function delete_(ctx: Ctx, user: UserRef, chatTurnId: string): Promise<void>;
function delete_(ctx: Ctx, user: UserRef, chatTurnIds: string[] | null): Promise<void>;
async function delete_(ctx: Ctx, a: ChatTurn[] | ChatTurn | UserRef, b?: string | string[] | null): Promise<void> {
  if (arguments.length >= 3) {
    if (Array.isArray(b) || b == null) return deleteByIds(ctx, a as UserRef, b ?? null);
    return deleteById(ctx, a as UserRef, b);
  }
  return deleteChatTurns(ctx, Array.isArray(a) ? (a as ChatTurn[]) : [a as ChatTurn]);
}
export { delete_ as delete };

/** `deleteChats(User, containerId)`: every turn of the user in the container. */
async function deleteChatsByContainer(ctx: Ctx, user: UserRef, containerId: string): Promise<void> {
  const container = await findContainer(ctx, containerId);
  await deleteChatTurns(ctx, await ChatTurnRepository.findAllByUserAndChatContainer(ctx.db, uid(user), container.id as string));
}

/** `deleteChats(List<String> chatIds, User, containerId)`. */
export async function deleteChatsByIds(
  ctx: Ctx,
  chatIds: string[] | null,
  user: UserRef,
  containerId: string,
): Promise<void> {
  const container = await findContainer(ctx, containerId);
  const turns = await ChatTurnRepository.findAllByUserAndContainerAndChatIdIn(
    ctx.db,
    uid(user),
    container.id as string,
    chatIds ?? [],
  );
  await deleteChatTurns(ctx, turns);
}

export function deleteChats(ctx: Ctx, user: UserRef, containerId: string): Promise<void>;
export function deleteChats(ctx: Ctx, chatIds: string[] | null, user: UserRef, containerId: string): Promise<void>;
export function deleteChats(ctx: Ctx, chats: Chat[]): Promise<void>;
export async function deleteChats(
  ctx: Ctx,
  a: UserRef | string[] | Chat[] | null,
  b?: string | UserRef,
  c?: string,
): Promise<void> {
  if (c !== undefined) return deleteChatsByIds(ctx, a as string[] | null, b as UserRef, c);
  if (typeof b === "string") return deleteChatsByContainer(ctx, a as UserRef, b);
  await ChatRepository.deleteAll(ctx.db, (a ?? []) as Chat[]);
}

/** `deleteTurnResultsByProject(user, projectId)`; the user may be omitted. */
export async function deleteTurnResultsByProject(ctx: Ctx, ...args: [UserRef, string] | [string]): Promise<void> {
  const [user, projectId] = (args.length === 2 ? args : [requireUser(ctx), args[0]]) as [UserRef, string];
  await deleteTurnResultsByTurnIds(ctx, user, projectId, await findLatestChatTurnIdsByProjectId(ctx, projectId, user));
}

/** `deleteTurnResultsByTurnIds(user, projectId, chatTurnIds)`; the user may be omitted. */
export async function deleteTurnResultsByTurnIds(
  ctx: Ctx,
  ...args: [UserRef, string, string[]] | [string, string[]]
): Promise<void> {
  const [user, projectId, chatTurnIds] = (args.length === 3 ? args : [requireUser(ctx), ...args]) as [
    UserRef,
    string,
    string[],
  ];
  await deleteTurnResults(ctx, user, projectId, await getChatTurnsByList(ctx, chatTurnIds, user));
}

/**
 * `deleteTurnResults(user, projectId, turns)`: drops the turns' responses (with their scores),
 * inference statuses and SxS human feedback; monitoring rows are kept but detached from the
 * container. The user may be omitted.
 */
export async function deleteTurnResults(
  ctx: Ctx,
  ...args: [UserRef, string, ChatTurn[]] | [string, ChatTurn[]]
): Promise<void> {
  const chatTurnList = (args.length === 3 ? args[2] : args[1]) as ChatTurn[];
  if (!chatTurnList.length) return;
  const db = ctx.db;
  const turnIds = ids(chatTurnList.map((t) => t.id));
  const withResponse = chatTurnList.filter((t) => t.modelResponseId != null);
  const responseIds = ids(withResponse.map((t) => t.modelResponseId));
  const [responses, scoresByResponse] = await Promise.all([
    ModelResponseRepository.findAllById(db, responseIds),
    ModelResponseRepository.findScoresByModelResponseIds(db, responseIds),
  ]);
  const scores = [...scoresByResponse.values()].flat();
  const ts = now();

  await runBatched(db, [
    ...updateIn(db, "inference_monitoring", "container_id = NULL, updated_at = ?", ids(responses.map((r) => r.inferenceMonitoringId)), ts),
    ...updateIn(db, "evaluation_monitoring", "container_id = NULL, updated_at = ?", ids(scores.map((s) => s.evaluationMonitoringId)), ts),
    ...updateIn(db, "chat_turns", "model_response_id = NULL, updated_at = ?", ids(withResponse.map((t) => t.id)), ts),
    ...chunk(turnIds).map((part) =>
      stmt(db, `DELETE FROM inference_status WHERE chat_turn_id IN ${placeholders(part.length)}`, ...part),
    ),
  ]);
  for (const t of withResponse) t.modelResponseId = null;

  if (scores.length) await ScoreV2Repository.deleteAll(db, scores);
  await ModelResponseRepository.deleteAllById(db, responseIds);
  await SXSHumanFeedbackRepository.deleteByChatTurnIdList(db, turnIds);
}

// ---------------------------------------------------------------------------------------------
// Bulk insert (datasets)

export async function addTurnsInBulk(
  ctx: Ctx,
  user: UserRef,
  containerId: string,
  bulkRequestList: ChatTurnGroupCreateRequest[],
): Promise<ChatTurnDTO[]> {
  const container = await findContainer(ctx, containerId);
  const allResults: ChatTurnDTO[] = [];
  for (const group of bulkRequestList ?? []) {
    const rows = group.rows ?? [];
    let chatId = group.chat_id;
    if (chatId == null || chatId === "") chatId = `chat-${crypto.randomUUID()}`;
    for (const row of rows) row.chat_id = chatId;
    const startingSeq = await getStartingSequence(ctx, user, chatId, container);
    const effectiveChatId = chatId;
    allResults.push(
      ...(await bulkInsertCommon(ctx, user, rows, container, (i) => [effectiveChatId, startingSeq + i])),
    );
  }
  return allResults;
}

async function bulkInsertCommon(
  ctx: Ctx,
  user: UserRef,
  requests: RowCreateRequest[],
  container: ContainerRef,
  chatSeqGen: (i: number, req: RowCreateRequest) => [string, number],
): Promise<ChatTurnDTO[]> {
  const modelMap = await ModelService.buildModelMap(ctx, user, (m: Model) => m.label);
  const defaultHumanEvaluator: HumanEvaluator | null =
    (await HumanEvaluatorService.getEvaluators(ctx, user, ScopeType.USER, ScoringMechanismType.CATEGORY))[0] ?? null;

  await validateChatTurnLimit(ctx, container, requests.length);

  const turnsToSave: ChatTurnWithRelations[] = [];
  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    const [chatId, sequenceId] = chatSeqGen(i, req);
    const chat = await findOrCreateChat(ctx, chatId, container, user);
    const turn: ChatTurnWithRelations = ChatTurnEntity.create({ userId: user.id, chatId: chat.id, sequenceId });
    turn.inputs = buildModelInputsForRow(req, user);
    turn.modelResponse = buildModelResponseForRow(req, user, modelMap, defaultHumanEvaluator);
    turnsToSave.push(turn);
  }
  await saveTurnsCascade(ctx, turnsToSave);
  return fromChatTurns(ctx.db, turnsToSave);
}

function buildModelInputsForRow(req: RowCreateRequest, user: UserRef): ModelInput[] {
  const userInput = ModelInputEntity.fromPrompt({ role: InputRole.USER, text: req.model_prompt ?? null }, user.id);
  if (req.expected_output != null && req.expected_output !== "") userInput.expectedOutput = req.expected_output;
  const inputs = [userInput];
  if (req.system_instruction != null && req.system_instruction.trim() !== "") {
    inputs.push(ModelInputEntity.fromPrompt({ role: InputRole.SYSTEM, text: req.system_instruction }, user.id));
  }
  return inputs;
}

function buildModelResponseForRow(
  req: RowCreateRequest,
  user: UserRef,
  modelMap: Map<string | null, Model>,
  defaultHumanEvaluator: HumanEvaluator | null,
): ChatTurnWithRelations["modelResponse"] {
  if (req.model_response == null || req.model_response === "") return null;
  const response: NonNullable<ChatTurnWithRelations["modelResponse"]> = ModelResponseEntity.create({
    userId: user.id,
    text: req.model_response,
  });
  if (req.model_label != null && req.model_label !== "") {
    response.modelId = modelMap.get(req.model_label)?.id ?? null;
  }
  const evalValue = req.human_score;
  if (evalValue != null && defaultHumanEvaluator && (evalValue === -1 || evalValue === 0 || evalValue === 1)) {
    response.humanEvalScores = [
      HumanEvalScoreEntity.create({ score: evalValue, humanEvaluatorId: defaultHumanEvaluator.id, userId: user.id }),
    ];
  }
  return response;
}

/** Java ignored the row variables here (the chat is created without them). */
async function findOrCreateChat(ctx: Ctx, chatId: string, container: ContainerRef, user: UserRef): Promise<Chat> {
  return (await findByChatId(ctx, chatId, user)) ?? (await createChat(ctx, chatId, container, user));
}

async function getStartingSequence(ctx: Ctx, user: UserRef, chatId: string, container: ContainerRef): Promise<number> {
  const max = await findMaxSequenceIdByUserAndContainerAndChatId(ctx, user, chatId, container);
  return max != null ? max + 1 : 0;
}

async function validateChatTurnLimit(ctx: Ctx, container: ContainerRef, newChatTurnsToAdd: number): Promise<void> {
  const currentCount = await ChatTurnRepository.countByContainer(ctx.db, container.id as string);
  if (currentCount + newChatTurnsToAdd > getMaxChatsLimit(container)) {
    throw new ResourceLimitExceedException(CHAT_TURN_LIMIT_EXCEEDED_MESSAGE(container.id));
  }
}
