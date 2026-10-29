import { newId } from "../lib/db";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "user_deletion_status";
/** Primary key column is `request_id`. */
export const ID_COLUMN = "request_id";
export const ID_PREFIX = "user-deletion-";

export interface UserDeletionStatus {
  requestId: string | null;
  userId: string | null;
  /** @CreationTimestamp */
  requestTimestamp: string | null;
  completedSteps: number | null;
  totalSteps: number | null;
  lastFailureStep: string | null;
  lastFailureMessage: string | null;
  lastStepRetries: number | null;
}

export const COLUMNS: Record<keyof UserDeletionStatus, string> = {
  requestId: "request_id",
  userId: "user_id",
  requestTimestamp: "request_timestamp",
  completedSteps: "completed_steps",
  totalSteps: "total_steps",
  lastFailureStep: "last_failure_step",
  lastFailureMessage: "last_failure_message",
  lastStepRetries: "last_step_retries",
};

export function create(init: Partial<UserDeletionStatus> = {}): UserDeletionStatus {
  return {
    requestId: null,
    userId: null,
    requestTimestamp: null,
    completedSteps: 0,
    totalSteps: 0,
    lastFailureStep: null,
    lastFailureMessage: null,
    lastStepRetries: 0,
    ...init,
  };
}

export function prePersist(e: UserDeletionStatus): void {
  if (e.requestId == null) e.requestId = newId(ID_PREFIX);
}

export function fromRow(row: Row): UserDeletionStatus {
  return {
    requestId: str(row.request_id),
    userId: str(row.user_id),
    requestTimestamp: str(row.request_timestamp),
    completedSteps: num(row.completed_steps),
    totalSteps: num(row.total_steps),
    lastFailureStep: str(row.last_failure_step),
    lastFailureMessage: str(row.last_failure_message),
    lastStepRetries: num(row.last_step_retries),
  };
}

export function toRow(e: UserDeletionStatus): Record<string, Param> {
  return {
    request_id: e.requestId,
    user_id: e.userId,
    request_timestamp: e.requestTimestamp,
    completed_steps: e.completedSteps,
    total_steps: e.totalSteps,
    last_failure_step: e.lastFailureStep,
    last_failure_message: e.lastFailureMessage,
    last_step_retries: e.lastStepRetries,
  };
}

export function toJson(e: UserDeletionStatus): Record<string, unknown> {
  return { ...e };
}
