import { newId } from "../lib/db";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "inference_status";
/** @PrePersist always assigns a fresh id on insert. */
export const ID_PREFIX = "id-";

export interface InferenceStatus {
  id: string | null;
  /** InferenceStatusEnum key */
  status: number | null;
  /** @OneToOne ChatTurn chatTurn (chat_turn_id, unique) */
  chatTurnId: string | null;
  userId: string | null;
  containerId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  comments: string | null;
  jobId: string | null;
  jobStatusId: string | null;
  reason: string | null;
}

export const COLUMNS: Record<keyof InferenceStatus, string> = {
  id: "id",
  status: "status",
  chatTurnId: "chat_turn_id",
  userId: "user_id",
  containerId: "container_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  comments: "comments",
  jobId: "job_id",
  jobStatusId: "job_status_id",
  reason: "reason",
};

export function create(init: Partial<InferenceStatus> = {}): InferenceStatus {
  return {
    id: null,
    status: null,
    chatTurnId: null,
    userId: null,
    containerId: null,
    createdAt: null,
    updatedAt: null,
    comments: null,
    jobId: null,
    jobStatusId: null,
    reason: null,
    ...init,
  };
}

/** Java prePersist overwrites the id unconditionally; call only when inserting a new row. */
export function prePersist(e: InferenceStatus): void {
  e.id = newId(ID_PREFIX);
}

/**
 * `deepCopy(chatTurn)`: status/user/comments/reason for another turn; containerId is the new
 * turn's chat container (Java: `chatTurn.getChat().getContainer().getId()`).
 */
export function deepCopy(
  e: InferenceStatus,
  chatTurnId: string | null,
  containerId: string | null,
): InferenceStatus {
  return create({
    status: e.status,
    chatTurnId,
    userId: e.userId,
    containerId,
    comments: e.comments,
    reason: e.reason,
  });
}

export function fromRow(row: Row): InferenceStatus {
  return {
    id: str(row.id),
    status: num(row.status),
    chatTurnId: str(row.chat_turn_id),
    userId: str(row.user_id),
    containerId: str(row.container_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    comments: str(row.comments),
    jobId: str(row.job_id),
    jobStatusId: str(row.job_status_id),
    reason: str(row.reason),
  };
}

export function toRow(e: InferenceStatus): Record<string, Param> {
  return {
    id: e.id,
    status: e.status,
    chat_turn_id: e.chatTurnId,
    user_id: e.userId,
    container_id: e.containerId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    comments: e.comments,
    job_id: e.jobId,
    job_status_id: e.jobStatusId,
    reason: e.reason,
  };
}

/** Scalar fields (@Data); callers add `chatTurn`. */
export function toJson(e: InferenceStatus): Record<string, unknown> {
  const { chatTurnId: _t, ...rest } = e;
  return rest;
}
