/** Port of domain/evaluator/pairwise/dto/HumanEvaluatorUpdateRequestDTO (unused by the API). */
export interface HumanEvaluatorUpdateRequestDTO {
  /** @Size(min = 1, max = 255) */
  name?: string | null;
  /** @Size(max = 1000) */
  description?: string | null;
}
