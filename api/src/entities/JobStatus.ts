import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "job_status";

/**
 * job_status has no created_at/updated_at: `startTime` is the @CreationTimestamp.
 * Ids are `job_<type>[_<subType>]-<uuid>` (see prePersist).
 */
export interface JobStatus {
  id: string | null;
  /** scorer / inference / bulk ... */
  type: string | null;
  /** @Transient: only used to build the id. */
  subType?: string | null;
  /** JobStatusEnum key */
  status: number | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne Project project (project_id) */
  projectId: string | null;
  startTime: string | null;
  endTime: string | null;
  comments: string | null;
  pending: number | null;
  inProgress: number | null;
  failed: number | null;
  successful: number | null;
  stopped: number | null;
  total: number | null;
}

export const COLUMNS: Record<Exclude<keyof JobStatus, "subType">, string> = {
  id: "id",
  type: "type",
  status: "status",
  userId: "user_id",
  projectId: "project_id",
  startTime: "start_time",
  endTime: "end_time",
  comments: "comments",
  pending: "pending",
  inProgress: "in_progress",
  failed: "failed",
  successful: "successful",
  stopped: "stopped",
  total: "total",
};

export function create(init: Partial<JobStatus> = {}): JobStatus {
  return {
    id: null,
    type: null,
    subType: null,
    status: null,
    userId: null,
    projectId: null,
    startTime: null,
    endTime: null,
    comments: null,
    pending: null,
    inProgress: null,
    failed: null,
    successful: null,
    stopped: null,
    total: null,
    ...init,
  };
}

/** Java prePersist (unconditional): `job_<type>[_<subType>]-<uuid>`. */
export function prePersist(e: JobStatus): void {
  let id = "job_" + e.type;
  if (e.subType != null && e.subType.trim() !== "") id += "_" + e.subType;
  e.id = id + "-" + crypto.randomUUID();
}

export function fromRow(row: Row): JobStatus {
  return {
    id: str(row.id),
    type: str(row.type),
    status: num(row.status),
    userId: str(row.user_id),
    projectId: str(row.project_id),
    startTime: str(row.start_time),
    endTime: str(row.end_time),
    comments: str(row.comments),
    pending: num(row.pending),
    inProgress: num(row.in_progress),
    failed: num(row.failed),
    successful: num(row.successful),
    stopped: num(row.stopped),
    total: num(row.total),
  };
}

/**
 * Counter columns have `DEFAULT 0` in the schema but JPA writes the (possibly null) field value,
 * so nulls are written as-is.
 */
export function toRow(e: JobStatus): Record<string, Param> {
  return {
    id: e.id,
    type: e.type,
    status: e.status,
    user_id: e.userId,
    project_id: e.projectId,
    start_time: e.startTime,
    end_time: e.endTime,
    comments: e.comments,
    pending: e.pending,
    in_progress: e.inProgress,
    failed: e.failed,
    successful: e.successful,
    stopped: e.stopped,
    total: e.total,
  };
}

export function toJson(e: JobStatus): Record<string, unknown> {
  const { userId: _u, projectId: _p, ...rest } = e;
  return { ...rest, subType: e.subType ?? null };
}
