/** Port of domain/job/BulkUploadJobStatusService + BulkUploadJobStatusServiceImpl. */
import type { BulkUploadJobStatus } from "../../entities/BulkUploadJobStatus";
import type { JobStatus } from "../../entities/JobStatus";
import type { User } from "../../entities/User";
import { BulkStatusEnumKey } from "../../enums/BulkStatusEnum";
import { getValueByKey } from "../../enums/InputStatusEnum";
import { ScorerStatusEnumKey } from "../../enums/ScorerStatusEnum";
import type { Ctx } from "../../lib/ctx";
import { CustomRuntimeException } from "../../lib/errors";
import { AGGREGATE, JOBS_DETAILS } from "../../util/PlanckConstants";
import * as BulkUploadJobStatusRepository from "./BulkUploadJobStatusRepository";
import * as BulkInputStatusDTO from "./dto/BulkInputStatusDTO";
import * as JobStatusDTO from "./dto/JobStatusDTO";

const JOBS_FAILED = "Jobs-failed";
const JOBS_SUCCESSFUL = "Jobs-Successful";
const JOBS_IN_PROGRESS = "Jobs-In-Progress";

export async function findAllByUserAndJobId(ctx: Ctx, jobId: string, userId: string): Promise<Record<string, number>> {
  const bulkStatuses = await BulkUploadJobStatusRepository.findAllByUserAndJobId(ctx.db, jobId, userId);
  if (!bulkStatuses.length) {
    throw new CustomRuntimeException("Job Id not found :" + userId + " and User :" + userId);
  }
  const count = (key: number) => bulkStatuses.filter((s) => s.status === key).length;
  return {
    [JOBS_IN_PROGRESS]: count(BulkStatusEnumKey.IN_PROGRESS) + count(ScorerStatusEnumKey.PENDING),
    [JOBS_SUCCESSFUL]: count(ScorerStatusEnumKey.SUCCESSFUL),
    [JOBS_FAILED]: count(ScorerStatusEnumKey.FAILED),
  };
}

export async function findByUserIdAndJobStatusId(
  ctx: Ctx,
  jobStatusId: string,
  userId: string,
): Promise<BulkUploadJobStatus[]> {
  return BulkUploadJobStatusRepository.findAllByUserAndJobStatusId(ctx.db, jobStatusId, userId);
}

/** `{ aggregate: JobStatusDTO, jobs_details: BulkInputStatusDTO[] }`. */
export async function getBulkDetailByJob(
  ctx: Ctx,
  jobStatusId: string,
  user: Pick<User, "id">,
  jobStatus: JobStatus,
): Promise<Record<string, unknown>> {
  const bulkStatuses = await findByUserIdAndJobStatusId(ctx, jobStatusId, user.id as string);
  return {
    [AGGREGATE]: JobStatusDTO.toJson({
      in_progress: jobStatus.inProgress,
      total: jobStatus.total,
      failed: jobStatus.failed,
      successful: jobStatus.successful,
    }),
    [JOBS_DETAILS]: bulkStatuses.map((s) =>
      BulkInputStatusDTO.toJson({
        id: s.id,
        // Java used InputStatusEnum for the label here.
        status: getValueByKey(s.status),
        message: s.comment,
        start_time: s.createdAt,
        end_time: s.updatedAt,
        user_id: s.userId,
      }),
    ),
  };
}

export async function deleteByUserIdAndJobStatusId(ctx: Ctx, jobStatusId: string, userId: string): Promise<void> {
  await BulkUploadJobStatusRepository.deleteAllByUserAndJobStatusIdStmt(ctx.db, jobStatusId, userId).run();
}

export async function deleteByUserId(ctx: Ctx, userId: string): Promise<void> {
  await BulkUploadJobStatusRepository.deleteByUserId(ctx.db, userId);
}
