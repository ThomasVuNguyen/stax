import { newId } from "../lib/db";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "bulk_upload_job_status";
export const ID_PREFIX = "id-";

export interface BulkUploadJobStatus {
  id: string | null;
  userId: string | null;
  comment: string | null;
  /** BulkStatusEnum key (primitive int in Java, defaults to 0). */
  status: number;
  fileName: string | null;
  promptType: string | null;
  jobStatusId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const COLUMNS: Record<keyof BulkUploadJobStatus, string> = {
  id: "id",
  userId: "user_id",
  comment: "comment",
  status: "status",
  fileName: "file_name",
  promptType: "prompt_type",
  jobStatusId: "job_status_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function create(init: Partial<BulkUploadJobStatus> = {}): BulkUploadJobStatus {
  return {
    id: null,
    userId: null,
    comment: null,
    status: 0,
    fileName: null,
    promptType: null,
    jobStatusId: null,
    createdAt: null,
    updatedAt: null,
    ...init,
  };
}

export function prePersist(e: BulkUploadJobStatus): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): BulkUploadJobStatus {
  return {
    id: str(row.id),
    userId: str(row.user_id),
    comment: str(row.comment),
    status: num(row.status) ?? 0,
    fileName: str(row.file_name),
    promptType: str(row.prompt_type),
    jobStatusId: str(row.job_status_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toRow(e: BulkUploadJobStatus): Record<string, Param> {
  return {
    id: e.id,
    user_id: e.userId,
    comment: e.comment,
    status: e.status ?? 0,
    file_name: e.fileName,
    prompt_type: e.promptType,
    job_status_id: e.jobStatusId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

export function toJson(e: BulkUploadJobStatus): Record<string, unknown> {
  return { ...e };
}
