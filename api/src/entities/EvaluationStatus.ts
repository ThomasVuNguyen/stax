import { newId } from "../lib/db";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "evaluation_status";
/** @PrePersist always assigns a fresh id on insert. */
export const ID_PREFIX = "evaluation-status-id-";

export interface EvaluationStatus {
  id: string | null;
  /** EvaluationStatusEnum key */
  status: number | null;
  chatTurnId: string | null;
  userId: string | null;
  containerId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  comments: string | null;
  jobId: string | null;
  evaluatorId: string | null;
  jobStatusId: string | null;
  reason: string | null;
}

export const COLUMNS: Record<keyof EvaluationStatus, string> = {
  id: "id",
  status: "status",
  chatTurnId: "chat_turn_id",
  userId: "user_id",
  containerId: "container_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  comments: "comments",
  jobId: "job_id",
  evaluatorId: "evaluator_id",
  jobStatusId: "job_status_id",
  reason: "reason",
};

export function create(init: Partial<EvaluationStatus> = {}): EvaluationStatus {
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
    evaluatorId: null,
    jobStatusId: null,
    reason: null,
    ...init,
  };
}

/** Java prePersist overwrites the id unconditionally; call only when inserting a new row. */
export function prePersist(e: EvaluationStatus): void {
  e.id = newId(ID_PREFIX);
}

/** `deepCopy()`: status, comments, evaluatorId, userId, reason. */
export function deepCopy(e: EvaluationStatus): EvaluationStatus {
  return create({
    status: e.status,
    comments: e.comments,
    evaluatorId: e.evaluatorId,
    userId: e.userId,
    reason: e.reason,
  });
}

export function fromRow(row: Row): EvaluationStatus {
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
    evaluatorId: str(row.evaluator_id),
    jobStatusId: str(row.job_status_id),
    reason: str(row.reason),
  };
}

export function toRow(e: EvaluationStatus): Record<string, Param> {
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
    evaluator_id: e.evaluatorId,
    job_status_id: e.jobStatusId,
    reason: e.reason,
  };
}

export function toJson(e: EvaluationStatus): Record<string, unknown> {
  return { ...e };
}
