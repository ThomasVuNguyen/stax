/** Port of domain/evaluator/pairwise/dto/HumanScoreUpdateRequestDTO (unused by the API). */
export interface HumanScoreUpdateRequestDTO {
  numericScore?: number | null;
  binaryScoreValue?: string | null;
  comment?: string | null;
}
