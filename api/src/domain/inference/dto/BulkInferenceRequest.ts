/** Port of domain/inference/dto/BulkInferenceRequest (JSON names). Not @Valid in the controller. */
export interface BulkInferenceRequest {
  model_ids?: string[] | null;
  chat_turn_ids?: string[] | null;
}
