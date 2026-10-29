/**
 * Helper (no Java counterpart): loads the JPA object graph the inference code navigates —
 * ChatTurn.inputs / .modelResponse(.model, .inferenceMonitoringId) / .inferenceStatus / .chat and
 * Chat.turns — in a few batched queries, and saves a turn the way `ChatService.saveChatTurn` +
 * the JPA cascades did (ModelResponse first, then the turn, then its inputs).
 *
 * Objects are shared inside one load call (turns of the same chat share the Chat object, a
 * ModelResponse referenced by two turns is one object), mirroring a JPA persistence context.
 */
import type { Ctx } from "../../../lib/ctx";
import { allIn } from "../../../lib/db";
import * as ChatEntity from "../../../entities/Chat";
import type { Chat } from "../../../entities/Chat";
import type { ChatTurn } from "../../../entities/ChatTurn";
import type { InferenceStatus } from "../../../entities/InferenceStatus";
import type { Model } from "../../../entities/Model";
import type { ModelInput } from "../../../entities/ModelInput";
import type { ModelResponse } from "../../../entities/ModelResponse";
import type { User } from "../../../entities/User";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import * as InferenceStatusRepository from "../../inferencestatus/InferenceStatusRepository";
import * as ModelRepository from "../../model/ModelRepository";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as ChatService from "../../chat/service/ChatService";

export interface LoadedModelResponse extends ModelResponse {
  /** EAGER ModelResponse.model */
  model: Model | null;
}

export interface LoadedChat extends Chat {
  /** Chat.turns ordered by sequence (loaded on demand with loadChatTurnsOf). */
  turns?: LoadedChatTurn[];
}

export interface LoadedChatTurn extends ChatTurn {
  inputs: ModelInput[];
  modelResponse: LoadedModelResponse | null;
  inferenceStatus: InferenceStatus | null;
  chat: LoadedChat;
}

export interface LoadOptions {
  /** Reuse these Chat objects (by id) instead of loading them. */
  chats?: LoadedChat[];
}

export function setModel(mr: LoadedModelResponse, model: Model | null): void {
  mr.model = model;
  mr.modelId = model ? model.id : null;
}

export function asLoadedModelResponse(mr: ModelResponse, model: Model | null): LoadedModelResponse {
  return Object.assign(mr, { model });
}

/** Loads the relations of many turns; result order = input order. */
export async function loadChatTurns(
  db: D1Database,
  turns: ChatTurn[],
  opts: LoadOptions = {},
): Promise<LoadedChatTurn[]> {
  if (!turns.length) return [];
  const ids = turns.map((t) => t.id as string);
  const mrIds = [...new Set(turns.map((t) => t.modelResponseId).filter((x): x is string => !!x))];

  const chatMap = new Map<string, LoadedChat>((opts.chats ?? []).map((c) => [c.id as string, c]));
  const chatIds = [...new Set(turns.map((t) => t.chatId).filter((x): x is string => !!x && !chatMap.has(x)))];

  const [inputs, responses, statuses, chats] = await Promise.all([
    ChatTurnRepository.findInputsByTurnIds(db, ids),
    mrIds.length ? ModelResponseRepository.findAllById(db, mrIds) : Promise.resolve([] as ModelResponse[]),
    InferenceStatusRepository.findAllByChatTurnIdIn(db, ids),
    chatIds.length
      ? allIn(db, (inn) => `SELECT * FROM chat WHERE id IN ${inn}`, chatIds).then((rows) => rows.map(ChatEntity.fromRow))
      : Promise.resolve([] as Chat[]),
  ]);
  for (const c of chats) chatMap.set(c.id as string, c);

  const modelIds = [...new Set(responses.map((r) => r.modelId).filter((x): x is string => !!x))];
  const models = new Map(
    (modelIds.length ? await ModelRepository.findAllById(db, modelIds) : []).map((m) => [m.id as string, m]),
  );
  const mrMap = new Map<string, LoadedModelResponse>(
    responses.map((r) => [r.id as string, asLoadedModelResponse(r, r.modelId ? (models.get(r.modelId) ?? null) : null)]),
  );
  const statusMap = new Map(statuses.map((s) => [s.chatTurnId as string, s]));

  return turns.map((t) =>
    Object.assign(t, {
      inputs: inputs.get(t.id as string) ?? [],
      modelResponse: t.modelResponseId ? (mrMap.get(t.modelResponseId) ?? null) : null,
      inferenceStatus: statusMap.get(t.id as string) ?? null,
      chat: chatMap.get(t.chatId as string) ?? (ChatEntity.create({ id: t.chatId }) as LoadedChat),
    }),
  );
}

export async function loadChatTurn(db: D1Database, turn: ChatTurn, opts: LoadOptions = {}): Promise<LoadedChatTurn> {
  return (await loadChatTurns(db, [turn], opts))[0];
}

/** Chat.getTurns(): every turn of the chat, ordered by sequence, sharing `chat`. */
export async function loadChatTurnsOf(db: D1Database, chat: LoadedChat): Promise<LoadedChatTurn[]> {
  await loadChatTurnsOfAll(db, [chat]);
  return chat.turns as LoadedChatTurn[];
}

/** Loads `turns` of several chats at once. */
export async function loadChatTurnsOfAll(db: D1Database, chats: LoadedChat[]): Promise<void> {
  if (!chats.length) return;
  const turns = await ChatTurnRepository.findByChatIn(
    db,
    chats.map((c) => c.id as string),
  );
  turns.sort((a, b) => (a.sequenceId ?? 0) - (b.sequenceId ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const loaded = await loadChatTurns(db, turns, { chats });
  for (const c of chats) c.turns = loaded.filter((t) => t.chatId === c.id);
}

/** Loads chats by id (no user filter), as LoadedChat objects without turns. */
export async function loadChats(db: D1Database, ids: string[]): Promise<Map<string, LoadedChat>> {
  const unique = [...new Set(ids.filter((x) => !!x))];
  const rows = unique.length ? await allIn(db, (inn) => `SELECT * FROM chat WHERE id IN ${inn}`, unique) : [];
  return new Map(rows.map((r) => ChatEntity.fromRow(r)).map((c) => [c.id as string, c as LoadedChat]));
}

/** Chat.getLatestTurn(). */
export function getLatestTurn(chat: LoadedChat): LoadedChatTurn | null {
  const turns = chat.turns ?? [];
  return turns.length ? turns[turns.length - 1] : null;
}

/** A new, unsaved turn of `chat` (Java `new ChatTurn(...)`). */
export function newChatTurn(
  chat: LoadedChat,
  init: Partial<ChatTurn> & { inputs?: ModelInput[]; modelResponse?: LoadedModelResponse | null },
): LoadedChatTurn {
  const { inputs, modelResponse, ...rest } = init;
  return {
    id: null,
    sequenceId: null,
    modelResponseId: null,
    userId: null,
    createdAt: null,
    updatedAt: null,
    ...rest,
    chatId: chat.id,
    inputs: inputs ?? [],
    modelResponse: modelResponse ?? null,
    inferenceStatus: null,
    chat,
  };
}

/**
 * `chatService.saveChatTurn(chatTurn, user)`: quota check, then the turn with its JPA cascades
 * (modelResponse, inputs through turn_inputs, inferenceStatus) — ChatService handles those for
 * the relations present on the object. Ids/timestamps are assigned on `turn` in place.
 */
export async function saveChatTurn(ctx: Ctx, turn: LoadedChatTurn, user: User): Promise<LoadedChatTurn> {
  turn.chatId = turn.chat.id;
  turn.modelResponseId = turn.modelResponse ? turn.modelResponse.id : null;
  const saved = await ChatService.saveChatTurn(ctx, turn, user);
  if (saved && saved !== turn) {
    turn.id = saved.id ?? turn.id;
    turn.createdAt = saved.createdAt ?? turn.createdAt;
    turn.updatedAt = saved.updatedAt ?? turn.updatedAt;
  }
  return turn;
}

/** Reads a value from a Java Map<String, T> ported either as a JS Map or as a plain object. */
export function mapGet<T>(m: unknown, key: string): T | undefined {
  if (m instanceof Map) return m.get(key) as T | undefined;
  if (m && typeof m === "object") return (m as Record<string, T>)[key];
  return undefined;
}
