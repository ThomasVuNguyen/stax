import { newId } from "../lib/db";
import { InputRole } from "../enums/InputRole";
import { enrichTextForResponse } from "../util/PromptUtil";
import { type Param, type Row, num, str } from "./EntitySupport";
import type { ModelInput } from "./ModelInput";

export const TABLE = "chat_turns";
export const ID_PREFIX = "chat-turn-";

/**
 * Relations not on the interface:
 * - `inputs` (@ManyToMany EAGER via `turn_inputs`): `ChatTurnRepository.findInputsByTurnId(s)`.
 * - `modelResponse` (EAGER): `modelResponseId` + `ModelResponseRepository.findById`.
 * - `inferenceStatus` (@OneToOne mappedBy chatTurn): `InferenceStatusRepository.findByChatTurnId`.
 * The helpers below take `{ inputs }` so callers pass the turn with its loaded inputs.
 */
export interface ChatTurn {
  id: string | null;
  /** @ManyToOne Chat chat (chat_id) */
  chatId: string | null;
  sequenceId: number | null;
  /** @ManyToOne ModelResponse modelResponse (model_response_id) */
  modelResponseId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** @Transient — never persisted. */
  effectiveSystemInstruction?: string | null;
}

export const COLUMNS: Record<Exclude<keyof ChatTurn, "effectiveSystemInstruction">, string> = {
  id: "id",
  chatId: "chat_id",
  sequenceId: "sequence_id",
  modelResponseId: "model_response_id",
  userId: "user_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function create(init: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: null,
    chatId: null,
    sequenceId: null,
    modelResponseId: null,
    userId: null,
    createdAt: null,
    updatedAt: null,
    ...init,
  };
}

/**
 * Java `new ChatTurn(inputs, modelResponse, user, previousChatTurn)`: same chat, sequence + 1.
 * (The `ChatTurn(inputs, modelResponse, user, chat)` constructor is `create({ chatId, sequenceId: 0, … })`.)
 */
export function createFromPrevious(
  previous: ChatTurn,
  init: Partial<ChatTurn> = {},
): ChatTurn {
  return create({ chatId: previous.chatId, sequenceId: (previous.sequenceId ?? 0) + 1, ...init });
}

export function prePersist(e: ChatTurn): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

/**
 * `copyFromExisting(existing)`: new id, copies sequenceId and user. The inference status copy
 * (`existing.getInferenceStatus().deepCopy(this)`) must be done by the caller with
 * `InferenceStatus.deepCopy(...)` since relations are not loaded here.
 */
export function copyFromExisting(turn: ChatTurn, existing: ChatTurn): void {
  turn.id = newId(ID_PREFIX);
  turn.sequenceId = existing.sequenceId;
  turn.userId = existing.userId;
}

export function fromRow(row: Row): ChatTurn {
  return {
    id: str(row.id),
    chatId: str(row.chat_id),
    sequenceId: num(row.sequence_id),
    modelResponseId: str(row.model_response_id),
    userId: str(row.user_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toRow(e: ChatTurn): Record<string, Param> {
  return {
    id: e.id,
    chat_id: e.chatId,
    sequence_id: e.sequenceId,
    model_response_id: e.modelResponseId,
    user_id: e.userId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/**
 * Scalar fields as Jackson emitted them. Callers add `chat`, `inputs`, `modelResponse`, `user`,
 * `inferenceStatus`, and the getter-derived `lastUserInput`, `rawInputText`, `enrichedInputText`
 * (use the helpers below) when serialising a whole entity.
 */
export function toJson(e: ChatTurn): Record<string, unknown> {
  return {
    id: e.id,
    sequenceId: e.sequenceId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    effectiveSystemInstruction: e.effectiveSystemInstruction ?? null,
  };
}

function userInputs(turn: { inputs?: ModelInput[] | null }): ModelInput[] | null {
  if (turn.inputs == null) return null;
  return turn.inputs.filter((i) => i.role === InputRole.USER);
}

/** `getLastUserInput()`: USER input with the greatest createdAt. */
export function getLastUserInput(turn: { inputs?: ModelInput[] | null }): ModelInput | null {
  const inputs = userInputs(turn);
  if (!inputs || !inputs.length) return null;
  return inputs.reduce((best, i) => ((i.createdAt ?? "") > (best.createdAt ?? "") ? i : best));
}

/** `getRawInputText()`: USER input texts joined by "\n" (null when none). */
export function getRawInputText(turn: { inputs?: ModelInput[] | null }): string | null {
  const inputs = userInputs(turn);
  if (!inputs || !inputs.length) return null;
  const texts = inputs.map((i) => i.text).filter((t): t is string => t != null);
  return texts.length ? texts.join("\n") : null;
}

/** `getEnrichedInputText()`: USER input texts with variables rendered by PromptUtil. */
export function getEnrichedInputText(turn: { inputs?: ModelInput[] | null }): string | null {
  const inputs = userInputs(turn);
  if (!inputs || !inputs.length) return null;
  const texts = inputs
    .map((i) => enrichTextForResponse(i.text, i.variables))
    .filter((t): t is string => t != null);
  return texts.length ? texts.join("\n") : null;
}
