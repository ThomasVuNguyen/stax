/**
 * Port of domain/evaluation/dto/EvaluationBulkRequest. `evaluator_ids` carries @NotEmpty, but the
 * controllers bind it without @Valid, so it is never validated.
 */
export interface EvaluationBulkRequest {
  evaluator_ids?: string[] | null;
}
