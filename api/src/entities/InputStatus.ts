import { newId } from "../lib/db";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "input_status";
/** @PrePersist always assigns a fresh id on insert. */
export const ID_PREFIX = "id-";

export interface InputStatus {
  id: string | null;
  /** InputStatusEnum key */
  status: number | null;
  inputId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne Project project (project_id) */
  projectId: string | null;
  comment: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  modelName: string | null;
  modelVersion: string | null;
  /** job_status_id (also the read-only @ManyToOne JobStatus jobStatus) */
  jobStatusId: string | null;
}

export const COLUMNS: Record<keyof InputStatus, string> = {
  id: "id",
  status: "status",
  inputId: "input_id",
  userId: "user_id",
  projectId: "project_id",
  comment: "comment",
  createdAt: "created_at",
  updatedAt: "updated_at",
  modelName: "model_name",
  modelVersion: "model_version",
  jobStatusId: "job_status_id",
};

export function create(init: Partial<InputStatus> = {}): InputStatus {
  return {
    id: null,
    status: null,
    inputId: null,
    userId: null,
    projectId: null,
    comment: null,
    createdAt: null,
    updatedAt: null,
    modelName: null,
    modelVersion: null,
    jobStatusId: null,
    ...init,
  };
}

/** Java prePersist overwrites the id unconditionally; call only when inserting a new row. */
export function prePersist(e: InputStatus): void {
  e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): InputStatus {
  return {
    id: str(row.id),
    status: num(row.status),
    inputId: str(row.input_id),
    userId: str(row.user_id),
    projectId: str(row.project_id),
    comment: str(row.comment),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    modelName: str(row.model_name),
    modelVersion: str(row.model_version),
    jobStatusId: str(row.job_status_id),
  };
}

export function toRow(e: InputStatus): Record<string, Param> {
  return {
    id: e.id,
    status: e.status,
    input_id: e.inputId,
    user_id: e.userId,
    project_id: e.projectId,
    comment: e.comment,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    model_name: e.modelName,
    model_version: e.modelVersion,
    job_status_id: e.jobStatusId,
  };
}

export function toJson(e: InputStatus): Record<string, unknown> {
  const { userId: _u, projectId: _p, ...rest } = e;
  return rest;
}
