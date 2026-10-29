/**
 * Port of domain/job/AbstractScoreQueueService (an abstract base class of the score queue
 * services). Its only behaviour, `trackJobStatus(evaluationDTO)`, is an exported function:
 *
 *   await AbstractScoreQueueService.trackJobStatus(ctx, evaluationDTO);
 *
 * It recomputes the job counters from EvaluationStatusService.findAllByUserAndJobId(ctx, jobId, userId).
 */
import type { Ctx } from "../../lib/ctx";
import * as EvaluationStatusService from "../evaluationstatus/EvaluationStatusService";
import * as JobStatusService from "./JobStatusService";

/** The EvaluationDTO fields used here (EvaluationDTO has no naming annotations: camelCase JSON). */
type EvaluationJobRef = { jobId: string | null; userId: string | null };

export async function trackJobStatus(ctx: Ctx, evaluationDTO: EvaluationJobRef): Promise<void> {
  await JobStatusService.trackJobStatusCommon(ctx, evaluationDTO.jobId as string, () =>
    EvaluationStatusService.findAllByUserAndJobId(ctx, evaluationDTO.jobId as string, evaluationDTO.userId as string),
  );
}
