import { newId } from "../lib/db";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "score_status";
/** @PrePersist always assigns a fresh id on insert. */
export const ID_PREFIX = "id-";

export interface ScoreStatus {
  id: string | null;
  /** ScorerStatusEnum key */
  status: number | null;
  /** column `reponse_id` (sic) */
  responseId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne Project project (project_id) */
  projectId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  comments: string | null;
  jobId: string | null;
  scorer: string | null;
  /** job_status_id (also the read-only @ManyToOne JobStatus jobStatus) */
  jobStatusId: string | null;
}

export const COLUMNS: Record<keyof ScoreStatus, string> = {
  id: "id",
  status: "status",
  responseId: "reponse_id",
  userId: "user_id",
  projectId: "project_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  comments: "comments",
  jobId: "job_id",
  scorer: "scorer",
  jobStatusId: "job_status_id",
};

export function create(init: Partial<ScoreStatus> = {}): ScoreStatus {
  return {
    id: null,
    status: null,
    responseId: null,
    userId: null,
    projectId: null,
    createdAt: null,
    updatedAt: null,
    comments: null,
    jobId: null,
    scorer: null,
    jobStatusId: null,
    ...init,
  };
}

/** Java prePersist overwrites the id unconditionally; call only when inserting a new row. */
export function prePersist(e: ScoreStatus): void {
  e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): ScoreStatus {
  return {
    id: str(row.id),
    status: num(row.status),
    responseId: str(row.reponse_id),
    userId: str(row.user_id),
    projectId: str(row.project_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    comments: str(row.comments),
    jobId: str(row.job_id),
    scorer: str(row.scorer),
    jobStatusId: str(row.job_status_id),
  };
}

export function toRow(e: ScoreStatus): Record<string, Param> {
  return {
    id: e.id,
    status: e.status,
    reponse_id: e.responseId,
    user_id: e.userId,
    project_id: e.projectId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    comments: e.comments,
    job_id: e.jobId,
    scorer: e.scorer,
    job_status_id: e.jobStatusId,
  };
}

export function toJson(e: ScoreStatus): Record<string, unknown> {
  const { userId: _u, projectId: _p, ...rest } = e;
  return rest;
}
