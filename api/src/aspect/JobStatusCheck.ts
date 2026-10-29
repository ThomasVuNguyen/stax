/**
 * Port of aspect/JobStatusCheckAspect (the `@CheckJobActive` annotation).
 *
 * USAGE: call it first thing in the queue handlers that were annotated with @CheckJobActive
 * (InferenceService.process(InferenceDTO), LLMScoreQueueService.process(EvaluationDTO),
 * PointwiseHeuristicEvaluationScoreQueueService.process(EvaluationDTO)):
 *
 *   import { checkJobActive } from "../../aspect/JobStatusCheck";
 *   export async function process(ctx: Ctx, inferenceDTO: InferenceDTO): Promise<void> {
 *     await checkJobActive(ctx, inferenceDTO);
 *     ...
 *   }
 *
 *   checkJobActive(ctx: Pick<Ctx, "db">, ...args: unknown[]): Promise<void>
 *
 * Like the aspect, every argument that carries a job id (`jobId`, or `job_id` for InferenceDTO
 * whose JSON name is `job_id`) is checked; other arguments are ignored. For each:
 * - unknown job -> NotFoundException("Job Status not fount for <id>") (JobStatusService.findById
 *   threw before the aspect's own null check could run);
 * - job STOPPED -> JobStatusStoppedException("Job is stopped: <id>").
 * Throwing skips processing. Queue messages are acked regardless (see src/index.ts), as the Java
 * listeners acked before processing.
 * One `SELECT status` by primary key per call.
 */
import { JobStatusEnum, getJobStatusEnumByKey } from "../enums/JobStatusEnum";
import type { Ctx } from "../lib/ctx";
import { first } from "../lib/db";
import { JobStatusStoppedException, NotFoundException, RuntimeException } from "../lib/errors";

function jobIdOf(arg: unknown): { present: boolean; jobId: string | null } {
  if (arg === null || typeof arg !== "object") return { present: false, jobId: null };
  const o = arg as Record<string, unknown>;
  if (!("jobId" in o) && !("job_id" in o)) return { present: false, jobId: null };
  const v = o.jobId ?? o.job_id;
  return { present: true, jobId: typeof v === "string" ? v : null };
}

export async function checkJobActive(ctx: Pick<Ctx, "db">, ...args: unknown[]): Promise<void> {
  for (const arg of args) {
    const { present, jobId } = jobIdOf(arg);
    if (!present) continue;
    // Spring Data's findById(null) failed with "The given id must not be null".
    if (jobId == null) throw new RuntimeException("The given id must not be null");

    const row = await first<{ status: number | null }>(ctx.db, `SELECT status FROM job_status WHERE id = ?`, jobId);
    if (!row) throw new NotFoundException("Job Status not fount for " + jobId);

    if (getJobStatusEnumByKey(row.status) === JobStatusEnum.STOPPED) {
      console.info(`Job ${jobId} is stopped, skipping processing.`);
      throw new JobStatusStoppedException("Job is stopped: " + jobId);
    }
  }
}
