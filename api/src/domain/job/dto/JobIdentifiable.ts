/**
 * Port of domain/job/dto/JobIdentifiable (`String getJobId()`), implemented by InferenceDTO and
 * EvaluationDTO. The TS DTOs carry their JSON names, so InferenceDTO has `job_id`
 * (@JsonProperty) while EvaluationDTO has `jobId`; both shapes are accepted.
 */
export type JobIdentifiable = { jobId?: string | null } | { job_id?: string | null };

/** `getJobId()` for either shape. */
export function getJobId(dto: JobIdentifiable): string | null {
  const o = dto as { jobId?: string | null; job_id?: string | null };
  return o.jobId ?? o.job_id ?? null;
}
