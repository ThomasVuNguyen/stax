/**
 * Port of domain/inference/dto/InferenceDTO (implements JobIdentifiable). Field names are the
 * JSON names; this is the payload of the `inference` queue job (Java: the Pub/Sub message).
 */
export interface InferenceDTO {
  chat_turn_id: string | null;
  job_id: string | null;
  user_id: string | null;
  project_id: string | null;
  comments: string | null;
  inference_status_id: string | null;
  model_id: string | null;
  reason: string | null;
}

/** `new InferenceDTO()` / builder: unset fields are null. */
export function newInferenceDTO(init: Partial<InferenceDTO> = {}): InferenceDTO {
  return {
    chat_turn_id: null,
    job_id: null,
    user_id: null,
    project_id: null,
    comments: null,
    inference_status_id: null,
    model_id: null,
    reason: null,
    ...init,
  };
}

/** JobIdentifiable.getJobId(). */
export function getJobId(dto: InferenceDTO): string | null {
  return dto.job_id;
}

/** Java toString() (used in log lines). */
export function toString(dto: InferenceDTO): string {
  return `InferenceDTO [chatTurnId=${dto.chat_turn_id}, jobId=${dto.job_id}, userId=${dto.user_id}, projectId=${dto.project_id}, comments=${dto.comments}, inferenceStatusId=${dto.inference_status_id}]`;
}
