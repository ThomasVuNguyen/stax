/**
 * Port of domain/job/InputStatusService + InputStatusServiceImpl.
 * `getInferenceDetailByJob(ctx, jobStatusId, user, jobStatus)` returns the JSON map
 * `{ aggregate: JobStatusDTO, jobs_details: InputStatusDTO[] }`.
 */
import type { InputStatus } from "../../entities/InputStatus";
import type { JobStatus } from "../../entities/JobStatus";
import type { User } from "../../entities/User";
import { InputStatusEnumKey, getValueByKey } from "../../enums/InputStatusEnum";
import type { Ctx } from "../../lib/ctx";
import { AGGREGATE, JOBS_DETAILS } from "../../util/PlanckConstants";
import * as InputStatusRepository from "./InputStatusRepository";
import * as InputStatusDTO from "./dto/InputStatusDTO";
import * as JobStatusDTO from "./dto/JobStatusDTO";

const JOBS_FAILED = "Jobs-failed";
const JOBS_SUCCESSFUL = "Jobs-Successful";
const JOBS_IN_PROGRESS = "Jobs-In-Progress";

/**
 * Counters polled by the UI (GET /job/{jobId}/status). Java loaded every row and grouped in memory;
 * here the grouping is a single COUNT ... GROUP BY on the indexed job_status_id.
 */
export async function findAllByJobStatusIdAndUser(
  ctx: Ctx,
  jobStatusId: string,
  userId: string,
): Promise<Record<string, number>> {
  const counts = await InputStatusRepository.countByStatusForUserAndJobStatusId(ctx.db, jobStatusId, userId);
  const n = (key: number) => counts.get(key) ?? 0;
  return {
    [JOBS_IN_PROGRESS]: n(InputStatusEnumKey.IN_PROGRESS) + n(InputStatusEnumKey.PENDING),
    [JOBS_SUCCESSFUL]: n(InputStatusEnumKey.SUCCESSFUL),
    [JOBS_FAILED]: n(InputStatusEnumKey.FAILED),
  };
}

export async function getInferenceDetailByJob(
  ctx: Ctx,
  jobStatusId: string,
  user: Pick<User, "id">,
  jobStatus: JobStatus,
): Promise<Record<string, unknown>> {
  const inputStatuses = await findByUserIdAndJobStatusId(ctx, jobStatusId, user.id as string);
  return {
    [AGGREGATE]: JobStatusDTO.toJson({
      in_progress: jobStatus.inProgress,
      total: jobStatus.total,
      failed: jobStatus.failed,
      successful: jobStatus.successful,
    }),
    [JOBS_DETAILS]: inputStatuses.map(toDetailDTO),
  };
}

export async function findByUserIdAndJobStatusId(ctx: Ctx, jobStatusId: string, userId: string): Promise<InputStatus[]> {
  return InputStatusRepository.findAllByUserAndJobStatusId(ctx.db, jobStatusId, userId);
}

/** convertToDTO(inputStatuses, userId): response id/output were never resolved (always null). */
function toDetailDTO(s: InputStatus): InputStatusDTO.InputStatusDTO {
  return InputStatusDTO.toJson({
    id: s.id,
    status: getValueByKey(s.status),
    message: s.comment,
    start_time: s.createdAt,
    end_time: s.updatedAt,
    model_name: s.modelName,
    input_id: s.inputId,
    user_id: s.userId,
    input: "",
    model_version: s.modelVersion,
  });
}

export async function deleteByUserIdAndJobStatusId(ctx: Ctx, jobStatusId: string, userId: string): Promise<void> {
  await InputStatusRepository.deleteAllByUserAndJobStatusIdStmt(ctx.db, jobStatusId, userId).run();
}
