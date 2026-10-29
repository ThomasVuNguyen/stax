/** Port of domain/evaluation/dto/ScorerResponseDTO (@JsonInclude NON_NULL). */
export interface ScorerResponseDTO {
  job_id?: string;
  responses?: unknown[];
  chat_turn_ids?: string[];
}

/** JSON view: null fields are omitted. */
export function toJson(dto: {
  jobId?: string | null;
  pythonSdkResponses?: unknown[] | null;
  chatTurnIds?: string[] | null;
}): ScorerResponseDTO {
  const out: ScorerResponseDTO = {};
  if (dto.jobId != null) out.job_id = dto.jobId;
  if (dto.pythonSdkResponses != null) out.responses = dto.pythonSdkResponses;
  if (dto.chatTurnIds != null) out.chat_turn_ids = dto.chatTurnIds;
  return out;
}
