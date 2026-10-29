/** Port of domain/inference/dto/BulkInferenceResponseDTO (@JsonInclude(NON_NULL)). */
export interface BulkInferenceResponseDTO {
  job_id?: string;
  chat_turn_ids?: string[];
}

/** `new BulkInferenceResponseDTO(jobId, chatTurnIds)`; null fields are omitted like Jackson NON_NULL. */
export function newBulkInferenceResponseDTO(
  jobId: string | null,
  chatTurnIds: string[] | null,
): BulkInferenceResponseDTO {
  const out: BulkInferenceResponseDTO = {};
  if (jobId != null) out.job_id = jobId;
  if (chatTurnIds != null) out.chat_turn_ids = chatTurnIds;
  return out;
}
