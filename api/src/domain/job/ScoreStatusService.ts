/**
 * Port of domain/job/ScoreStatusService + ScoreStatusServiceImpl.
 * `findEvalByJobId` returns `{ aggregate: JobStatusDTO, jobs_details: EvaluationStatusDTO[] }` where
 * each detail is the JSON of domain/evaluationstatus/EvaluationStatusDTO (snake_case, NON_NULL,
 * only id/status/start_time/end_time/message/evaluator_id are serialised; the rest is @JsonIgnore).
 */
import type { EvaluationStatus } from "../../entities/EvaluationStatus";
import type { JobStatus } from "../../entities/JobStatus";
import type { User } from "../../entities/User";
import { getValueByKey } from "../../enums/EvaluationStatusEnum";
import type { Ctx } from "../../lib/ctx";
import { CustomRuntimeException } from "../../lib/errors";
import { AGGREGATE, JOBS_DETAILS } from "../../util/PlanckConstants";
import * as EvaluationStatusRepository from "../evaluationstatus/EvaluationStatusRepository";
import * as ScoreStatusRepository from "./ScoreStatusRepository";
import * as JobStatusDTO from "./dto/JobStatusDTO";

export async function findEvalByJobId(
  ctx: Ctx,
  jobId: string,
  user: Pick<User, "id">,
  jobStatus: JobStatus,
): Promise<Record<string, unknown>> {
  const userId = user.id as string;
  const evaluationStatuses = await EvaluationStatusRepository.findAllByJobIdAndUserId(ctx.db, jobId, userId);
  if (!evaluationStatuses.length) {
    throw new CustomRuntimeException("Job Id not found :" + userId + " and User :" + userId);
  }
  return {
    [AGGREGATE]: JobStatusDTO.toJson({
      pending: jobStatus.pending,
      in_progress: jobStatus.inProgress,
      total: jobStatus.total,
      failed: jobStatus.failed,
      successful: jobStatus.successful,
    }),
    [JOBS_DETAILS]: evaluationStatuses.map(convertToDTO),
  };
}

/** ScoreStatusServiceImpl.convertToDTO, serialised (message is never set). */
export function convertToDTO(e: EvaluationStatus): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fields: Record<string, unknown> = {
    id: e.id,
    status: getValueByKey(e.status),
    start_time: e.createdAt,
    end_time: e.updatedAt,
    evaluator_id: e.evaluatorId,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

export async function deleteByUserAndJobId(ctx: Ctx, jobId: string, userId: string): Promise<void> {
  await ScoreStatusRepository.deleteAllByUserAndJobIdStmt(ctx.db, jobId, userId).run();
}
