/**
 * Port of domain/evaluationstatus/EvaluationStatusDTO (snake_case, NON_NULL). @JsonIgnore fields
 * (statusId, userId, jobId, projectId, chatTurnId, jobStatusId) are never serialised and only kept
 * as optional camelCase properties for callers that build the DTO.
 */
export interface EvaluationStatusDTO {
  id?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  message?: string;
  evaluator_id?: string;
  statusId?: number;
  userId?: string;
  jobId?: string;
  projectId?: string;
  chatTurnId?: string;
  jobStatusId?: string;
}

/** JSON view: only the serialised properties, nulls dropped. */
export function toJson(dto: EvaluationStatusDTO): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["id", "status", "start_time", "end_time", "message", "evaluator_id"] as const) {
    if (dto[k] != null) out[k] = dto[k];
  }
  return out;
}
