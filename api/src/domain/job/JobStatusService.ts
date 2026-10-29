/**
 * Port of domain/job/JobStatusService + JobStatusServiceImpl.
 *
 * - `user` params accept any object with an `id` (entities/User or AuthUser); `project` params
 *   any object with an `id` (or null).
 * - Overloads: `bulkDeleteJobStatusByJobId(ctx, jobStatuses: JobStatus[], user)` is the
 *   Collection<JobStatus> variant; the Set<String> variant is `bulkDeleteJobStatusByJobIds(ctx,
 *   jobIds, user)`.
 * - `findAllJobStatusGroupedByProject` returns a JS `Map<projectId, JobStatusDTO[]>`,
 *   `getJobIdsGroupedByStatus` a plain object keyed by enum name (insertion-ordered, as the Java
 *   LinkedHashMap serialised).
 * - `trackJobStatusCommon(ctx, jobId, statFetcher)`: the fetcher may be sync or async.
 * - stopJobStatus updates the inference/evaluation status rows through their repositories
 *   (InferenceStatusService/EvaluationStatusService.update*Status(new, jobId, comment, old) only
 *   delegated to these queries).
 * - Listing endpoints load the input statuses of all listed jobs in one query (Java: one per job),
 *   and deletes of several jobs run as one D1 batch (@Transactional).
 */
import * as JobStatusEntity from "../../entities/JobStatus";
import type { JobStatus } from "../../entities/JobStatus";
import type { InputStatus } from "../../entities/InputStatus";
import type { User } from "../../entities/User";
import { EvaluationStatusEnumKey } from "../../enums/EvaluationStatusEnum";
import { InferenceStatusEnumKey } from "../../enums/InferenceStatusEnum";
import { InputStatusEnumKey, getValueByKey as inputStatusValue } from "../../enums/InputStatusEnum";
import {
  JobStatusEnum,
  JobStatusEnumKey,
  JobStatusEnumValue,
  JobStatusEnumValues,
  getJobStatusEnumByKey,
  getValueByKey as jobStatusValue,
} from "../../enums/JobStatusEnum";
import type { Ctx } from "../../lib/ctx";
import { now } from "../../lib/db";
import { NotFoundException, RuntimeException } from "../../lib/errors";
import {
  BULK,
  EVAL,
  INFERENCE,
  JOBS_FAILED,
  JOBS_IN_PROGRESS,
  JOBS_PENDING,
  JOBS_STOPPED,
  JOBS_SUCCESSFUL,
} from "../../util/PlanckConstants";
import * as EvaluationStatusRepository from "../evaluationstatus/EvaluationStatusRepository";
import * as InferenceStatusRepository from "../inferencestatus/InferenceStatusRepository";
import * as BulkUploadJobStatusRepository from "./BulkUploadJobStatusRepository";
import * as BulkUploadJobStatusService from "./BulkUploadJobStatusService";
import * as InputStatusRepository from "./InputStatusRepository";
import * as InputStatusService from "./InputStatusService";
import * as JobStatusRepository from "./JobStatusRepository";
import * as ScoreStatusRepository from "./ScoreStatusRepository";
import * as ScoreStatusService from "./ScoreStatusService";
import * as GridResponse from "./dto/GridResponse";
import * as InputStatusDTO from "./dto/InputStatusDTO";
import * as JobStatusDTO from "./dto/JobStatusDTO";
import type { JobStatusPage } from "./dto/JobStatusPage";

type UserRef = Pick<User, "id">;
type ProjectRef = { id: string | null };

const uid = (user: UserRef) => user.id as string;
const eqIgnoreCase = (a: string, b: string | null) => b != null && a.toLowerCase() === b.toLowerCase();

export async function createJobStatus(
  ctx: Ctx,
  type: string,
  subType: string | null,
  user: UserRef,
  projectId: string | null,
  inputStatusEnum: JobStatusEnum,
  total: number | null,
): Promise<JobStatus> {
  const jobStatus = JobStatusEntity.create({
    status: JobStatusEnumKey[inputStatusEnum],
    userId: uid(user),
    projectId: projectId ?? null,
    type,
    subType: subType != null && subType.trim() !== "" ? subType : null,
    total,
    inProgress: total,
    successful: 0,
    failed: 0,
    comments: `${type} is ${JobStatusEnumValue[inputStatusEnum]} stat.`,
  });
  const saved = await JobStatusRepository.save(ctx.db, jobStatus);
  console.info(`Job Status created successfully id: ${saved.id}, status:${JobStatusEnumValue[inputStatusEnum]}`);
  return saved;
}

export async function createScorerJobStatus(
  ctx: Ctx,
  type: string,
  subType: string | null,
  user: UserRef,
  inputStatusEnum: JobStatusEnum,
  total: number | null,
  project: ProjectRef | null,
): Promise<JobStatus> {
  const jobStatus = JobStatusEntity.create({
    status: JobStatusEnumKey[inputStatusEnum],
    userId: uid(user),
    type,
    subType: subType != null && subType.trim() !== "" ? subType : null,
    total,
    pending: total,
    inProgress: 0,
    successful: 0,
    failed: 0,
    projectId: project?.id ?? null,
    comments: `Score is ${JobStatusEnumValue[inputStatusEnum]} stat.`,
  });
  return JobStatusRepository.save(ctx.db, jobStatus);
}

export async function updateJobStatus(
  ctx: Ctx,
  pending: number | null,
  inprogress: number | null,
  failed: number | null,
  stopped: number | null,
  successful: number | null,
  inputStatusEnum: JobStatusEnum,
  jobId: string,
): Promise<void> {
  await JobStatusRepository.updateStatusById(ctx.db, inputStatusEnum, pending, inprogress, successful, failed, stopped, jobId);
  // Java compared against InputStatusEnum keys (SUCCESSFUL=3, FAILED=4), i.e. JobStatus COMPLETED/FAILED.
  const key = JobStatusEnumKey[inputStatusEnum];
  if (key === InputStatusEnumKey.SUCCESSFUL || key === InputStatusEnumKey.FAILED) {
    await JobStatusRepository.updateEndTimeByJobStatusId(ctx.db, now(), jobId);
  }
}

export async function stopJobStatus(ctx: Ctx, jobStatusId: string, endTime: Date | string, projectId: string): Promise<void> {
  const jobStatus = await JobStatusRepository.findById(ctx.db, jobStatusId);
  if (jobStatus == null) throw new NotFoundException("JobStatus not found for id: " + jobStatusId);
  if (jobStatus.projectId == null) {
    // jobStatus.getProject().getId() on a job without project: NullPointerException.
    throw new RuntimeException('Cannot invoke "com.planck.planck.entitities.Project.getId()" because the return value of "com.planck.planck.entitities.JobStatus.getProject()" is null');
  }
  if (jobStatus.projectId !== projectId) throw new NotFoundException("JobStatus not found for id: " + jobStatusId);

  const current = getJobStatusEnumByKey(jobStatus.status);
  if (current === JobStatusEnum.STOPPED || current === JobStatusEnum.COMPLETED) {
    // java.lang.IllegalStateException -> RuntimeException handler (500 RUNTIME_ERROR)
    throw new RuntimeException("JobStatus already STOPPED or COMPLETED");
  }

  let stoppedStatuses = 0;
  const comment = "Job has been stopped manually.";
  if (eqIgnoreCase(INFERENCE, jobStatus.type)) {
    stoppedStatuses = await InferenceStatusRepository.updateStatusByJobIdAndUserId(
      ctx.db,
      InferenceStatusEnumKey.STOPPED,
      jobStatusId,
      comment,
      InferenceStatusEnumKey.PENDING,
    );
  } else if (eqIgnoreCase(EVAL, jobStatus.type)) {
    stoppedStatuses = await EvaluationStatusRepository.updateStatusByJobIdAndUserId(
      ctx.db,
      EvaluationStatusEnumKey.STOPPED,
      jobStatusId,
      comment,
      EvaluationStatusEnumKey.PENDING,
    );
  }

  jobStatus.status = JobStatusEnumKey.STOPPED;
  jobStatus.endTime = endTime instanceof Date ? endTime.toISOString() : endTime;
  jobStatus.stopped = stoppedStatuses;
  await JobStatusRepository.save(ctx.db, jobStatus);
}

function pageable(page: JobStatusPage) {
  // PageRequest.of(pageIndex - 1, pageSize) validation (java.lang.IllegalArgumentException -> 500).
  if (page.pageIndex - 1 < 0) throw new RuntimeException("Page index must not be less than zero");
  if (page.pageSize < 1) throw new RuntimeException("Page size must not be less than one");
  return {
    page: page.pageIndex - 1,
    size: page.pageSize,
    sort: [{ property: "startTime", direction: "DESC" as const }],
  };
}

export async function findAllJobStatusByUser(
  ctx: Ctx,
  user: UserRef,
  promptJobStatusPage: JobStatusPage,
): Promise<GridResponse.GridResponse> {
  const totalRecords = await JobStatusRepository.findCountAllByUser(ctx.db, uid(user));
  const jobStatuses = await JobStatusRepository.findResultsAllByUserAndPageable(
    ctx.db,
    uid(user),
    pageable(promptJobStatusPage),
  );
  return GridResponse.create(await convertJobStatusesToDTO(ctx, uid(user), jobStatuses), totalRecords);
}

export async function findAllJobStatusGroupedByProject(
  ctx: Ctx,
  user: UserRef,
  projectIds: string[],
): Promise<Map<string, JobStatusDTO.JobStatusDTO[]>> {
  const jobStatuses = await JobStatusRepository.findAllByUserAndProjectIds(ctx.db, uid(user), projectIds);
  const dtos = await convertJobStatusesToDTO(ctx, uid(user), jobStatuses);
  const grouped = new Map<string, JobStatusDTO.JobStatusDTO[]>();
  jobStatuses.forEach((js, i) => {
    const key = js.projectId as string;
    const list = grouped.get(key) ?? [];
    list.push(dtos[i]);
    grouped.set(key, list);
  });
  return grouped;
}

export async function findAllJobStatusByProject(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
  promptJobStatusPage: JobStatusPage,
): Promise<GridResponse.GridResponse> {
  const totalRecords = await JobStatusRepository.findCountAllByUserAndProjectId(ctx.db, uid(user), projectId);
  const jobStatuses = await JobStatusRepository.findResultsAllByUserAndProjectIdAndPageable(
    ctx.db,
    uid(user),
    projectId,
    pageable(promptJobStatusPage),
  );
  return GridResponse.create(await convertJobStatusesToDTO(ctx, uid(user), jobStatuses), totalRecords);
}

/** convertJobStatusToDTO for a list, with the input statuses of all jobs loaded in one query. */
async function convertJobStatusesToDTO(
  ctx: Ctx,
  userId: string,
  jobStatuses: JobStatus[],
): Promise<JobStatusDTO.JobStatusDTO[]> {
  const ids = jobStatuses.map((j) => j.id as string);
  const inputs = await InputStatusRepository.findAllByUserAndJobStatusIdIn(ctx.db, ids, userId);
  const byJob = new Map<string, InputStatus[]>();
  for (const s of inputs) {
    const list = byJob.get(s.jobStatusId as string) ?? [];
    list.push(s);
    byJob.set(s.jobStatusId as string, list);
  }
  return jobStatuses.map((j) => convertJobStatusToDTO(j, byJob.get(j.id as string) ?? []));
}

function convertJobStatusToDTO(j: JobStatus, inputStatuses: InputStatus[]): JobStatusDTO.JobStatusDTO {
  return JobStatusDTO.toJson({
    status: jobStatusValue(j.status),
    job_id: j.id,
    type: j.type,
    start_time: j.startTime,
    end_time: j.endTime,
    input_ids: inputStatuses.map((s) =>
      InputStatusDTO.toJson({
        status: inputStatusValue(s.status),
        start_time: s.createdAt,
        end_time: s.updatedAt,
        message: s.comment,
        model_name: s.modelName,
        model_version: s.modelVersion,
      }),
    ),
    pending: j.pending,
    in_progress: j.inProgress,
    failed: j.failed,
    successful: j.successful,
    total: j.total,
  });
}

/** NotFoundException("Job Status not fount for <id>") when missing (never returns null). */
export async function findById(ctx: Ctx, jobId: string): Promise<JobStatus> {
  const jobStatus = await JobStatusRepository.findById(ctx.db, jobId);
  if (jobStatus) return jobStatus;
  throw new NotFoundException("Job Status not fount for " + jobId);
}

export async function fetchDetailByJob(
  ctx: Ctx,
  jobStatusId: string,
  user: UserRef,
): Promise<Record<string, unknown>> {
  const jobStatus = await findById(ctx, jobStatusId);
  if (eqIgnoreCase(INFERENCE, jobStatus.type)) {
    return InputStatusService.getInferenceDetailByJob(ctx, jobStatusId, user, jobStatus);
  } else if (eqIgnoreCase(EVAL, jobStatus.type)) {
    return ScoreStatusService.findEvalByJobId(ctx, jobStatusId, user, jobStatus);
  } else if (eqIgnoreCase(BULK, jobStatus.type)) {
    return BulkUploadJobStatusService.getBulkDetailByJob(ctx, jobStatusId, user, jobStatus);
  }
  throw new NotFoundException("Job Status not found for :" + jobStatusId);
}

/** Child-row delete + job delete statements for one job, or null when the type is not deletable. */
function deleteStatements(ctx: Ctx, jobStatus: JobStatus, userId: string): D1PreparedStatement[] | null {
  // Java never checked that the job belonged to the user; jobs of other users are left untouched.
  if (jobStatus.userId !== userId) return null;
  const id = jobStatus.id as string;
  let child: D1PreparedStatement;
  if (eqIgnoreCase(INFERENCE, jobStatus.type)) {
    child = InputStatusRepository.deleteAllByUserAndJobStatusIdStmt(ctx.db, id, userId);
  } else if (eqIgnoreCase(EVAL, jobStatus.type)) {
    child = ScoreStatusRepository.deleteAllByUserAndJobIdStmt(ctx.db, id, userId);
  } else if (eqIgnoreCase(BULK, jobStatus.type)) {
    child = BulkUploadJobStatusRepository.deleteAllByUserAndJobStatusIdStmt(ctx.db, id, userId);
  } else {
    return null;
  }
  return [child, JobStatusRepository.deleteByIdStmt(ctx.db, id)];
}

export async function deleteJobStatusByJobId(ctx: Ctx, jobStatusId: string, user: UserRef): Promise<void> {
  const jobStatus = await findById(ctx, jobStatusId);
  const stmts = deleteStatements(ctx, jobStatus, uid(user));
  if (stmts) await ctx.db.batch(stmts);
}

export async function deleteByUser(ctx: Ctx, user: UserRef): Promise<void> {
  await JobStatusRepository.deleteByUser(ctx.db, uid(user));
}

/** Java declared List<JobStatus> on a @Modifying delete; the deleted row count is returned. */
export async function deleteByProject(ctx: Ctx, user: UserRef, projectId: string): Promise<number> {
  return JobStatusRepository.deleteByUserAndProjectId(ctx.db, uid(user), projectId);
}

export async function deleteByProjectIdAndUserId(ctx: Ctx, projectId: string, user: UserRef): Promise<number> {
  const jobs = await JobStatusRepository.findAllByUserAndProjectIds(ctx.db, uid(user), [projectId]);
  if (!jobs.length) return 0;
  return bulkDeleteJobStatusByJobId(ctx, jobs, user);
}

export async function bulkDeleteJobStatusByJobId(ctx: Ctx, jobStatusSet: JobStatus[], user: UserRef): Promise<number> {
  if (!jobStatusSet.length) throw new NotFoundException("Jobs not found by user");
  const stmts: D1PreparedStatement[] = [];
  let count = 0;
  for (const jobStatus of jobStatusSet) {
    const s = deleteStatements(ctx, jobStatus, uid(user));
    if (s) {
      stmts.push(...s);
      count++;
    }
  }
  if (stmts.length) await ctx.db.batch(stmts);
  return count;
}

/** Java overload `bulkDeleteJobStatusByJobId(Set<String> jobsIdSet, User user)`. */
export async function bulkDeleteJobStatusByJobIds(
  ctx: Ctx,
  jobsIdSet: Iterable<string>,
  user: UserRef,
): Promise<number> {
  const allJobs = await JobStatusRepository.findAllById(ctx.db, [...new Set(jobsIdSet)]);
  return bulkDeleteJobStatusByJobId(ctx, allJobs, user);
}

export async function hasRemainingJobsByProject(ctx: Ctx, user: UserRef, projectId: string): Promise<boolean> {
  return JobStatusRepository.existsByUserAndProjectIdAndStatusIn(ctx.db, uid(user), projectId, [
    JobStatusEnumKey.PENDING,
    JobStatusEnumKey.IN_PROGRESS,
  ]);
}

export async function getJobIdsGroupedByStatus(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
  statuses: JobStatusEnum[] | null,
): Promise<Partial<Record<JobStatusEnum, string[]>>> {
  const statusList = statuses == null || statuses.length === 0 ? JobStatusEnumValues : statuses;
  // Java ran findIdsByUserAndProjectIdAndStatus once per status; one IN query here.
  const rows = await JobStatusRepository.findIdsAndStatusByUserAndProjectIdAndStatusIn(
    ctx.db,
    uid(user),
    projectId,
    [...new Set(statusList.map((s) => JobStatusEnumKey[s]))],
  );
  const result: Partial<Record<JobStatusEnum, string[]>> = {};
  for (const s of statusList) {
    result[s] = rows.filter((r) => Number(r.status) === JobStatusEnumKey[s]).map((r) => r.id);
  }
  return result;
}

export async function trackJobStatusCommon(
  ctx: Ctx,
  jobId: string,
  statFetcher: (jobId: string) => Record<string, number> | Map<string, number> | Promise<Record<string, number> | Map<string, number>>,
): Promise<void> {
  const raw = await statFetcher(jobId);
  const stats = raw instanceof Map ? Object.fromEntries(raw) : (raw ?? {});

  const jobStatus = await JobStatusRepository.findById(ctx.db, jobId);
  if (!jobStatus) throw new NotFoundException("JobStatus not found for id: " + jobId);
  if (getJobStatusEnumByKey(jobStatus.status) === JobStatusEnum.STOPPED) return;

  const pending = stats[JOBS_PENDING] ?? 0;
  const inProgress = stats[JOBS_IN_PROGRESS] ?? 0;
  const failed = stats[JOBS_FAILED] ?? 0;
  const stopped = stats[JOBS_STOPPED] ?? 0;
  const successful = stats[JOBS_SUCCESSFUL] ?? 0;
  const total = pending + inProgress + failed + successful;

  const status = determineStatusMain(total, inProgress, failed, pending, successful, stopped);
  await updateJobStatus(ctx, pending, inProgress, failed, stopped, successful, status, jobId);
}

function determineStatusMain(
  total: number,
  _inProgress: number,
  failed: number,
  pending: number,
  successful: number,
  stopped: number,
): JobStatusEnum {
  if (pending === total) return JobStatusEnum.PENDING;
  if (failed === total) return JobStatusEnum.FAILED;
  if (successful + failed + stopped === total) return JobStatusEnum.COMPLETED;
  return JobStatusEnum.IN_PROGRESS;
}

export async function stopAllJobsByUser(ctx: Ctx, user: UserRef): Promise<void> {
  await JobStatusRepository.stopAllOngoingJobsByUser(ctx.db, uid(user));
}
