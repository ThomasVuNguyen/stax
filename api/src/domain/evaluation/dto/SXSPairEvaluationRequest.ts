/** Port of domain/evaluation/dto/SXSPairEvaluationRequest (JSON names). */
export interface SXSPairEvaluationRequest {
  /** @NotEmpty "Pair ID cannot be empty" (never validated: the containing lists are not @Valid). */
  id: string;
  chat_turn_id_a: string | null;
  chat_turn_id_b: string | null;
}
