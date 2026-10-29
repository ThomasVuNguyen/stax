/** Port of domain/project/dto/SxsEvaluationPairUpdateDTO (camelCase JSON, NON_NULL). */
export interface SxsEvaluationPairUpdateDTO {
  input?: string | null;
  expectedOutput?: string | null;
  variables?: Record<string, string> | null;
  /** Tag names. */
  tags?: string[] | null;
}
