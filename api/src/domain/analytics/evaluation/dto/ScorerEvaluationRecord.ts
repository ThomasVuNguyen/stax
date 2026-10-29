/** Port of analytics/evaluation/dto/ScorerEvaluationRecord (record). */
export interface ScorerEvaluationRecord {
  scorerId: string;
  scorerName: string;
  score: string;
  count: number;
}
