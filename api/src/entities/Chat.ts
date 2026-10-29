import { newId } from "../lib/db";
import { type Param, type Row, jsonMap, mapColumn, str } from "./EntitySupport";
import type { ChatTurn } from "./ChatTurn";

export const TABLE = "chat";
export const ID_PREFIX = "chat-";

/**
 * `turns` (@OneToMany mappedBy chat, cascade ALL + orphanRemoval) is not on the interface; load it
 * with `ChatTurnRepository.findByChatIdOrderBySequenceIdAsc`-style functions. Deleting a chat
 * cascades to chat_turns through the FK (ON DELETE CASCADE).
 */
export interface Chat {
  id: string | null;
  /** @ManyToOne EvaluationContainer container (container_id) */
  containerId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  variables: Record<string, string> | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const COLUMNS: Record<keyof Chat, string> = {
  id: "id",
  containerId: "container_id",
  userId: "user_id",
  variables: "variables",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function create(init: Partial<Chat> = {}): Chat {
  return { id: null, containerId: null, userId: null, variables: {}, createdAt: null, updatedAt: null, ...init };
}

export function prePersist(e: Chat): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): Chat {
  return {
    id: str(row.id),
    containerId: str(row.container_id),
    userId: str(row.user_id),
    variables: jsonMap(row.variables),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toRow(e: Chat): Record<string, Param> {
  return {
    id: e.id,
    container_id: e.containerId,
    user_id: e.userId,
    variables: mapColumn(e.variables),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/** Scalar fields as Jackson emitted them; callers add `container`, `user`, `turns`, `latestTurn`. */
export function toJson(e: Chat): Record<string, unknown> {
  return { id: e.id, variables: e.variables, createdAt: e.createdAt, updatedAt: e.updatedAt };
}

/** `getLatestTurn()`: last element of the (sequence-ordered) turns list, or null. */
export function getLatestTurn(chat: { turns?: ChatTurn[] | null }): ChatTurn | null {
  const turns = chat.turns ?? [];
  return turns.length ? turns[turns.length - 1] : null;
}
