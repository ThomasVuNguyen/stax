/** Port of analytics/evaluation/dto/EvaluationAnalyticsRowDTO (record). */
export interface EvaluationAnalyticsRowDTO {
  score: number | null;
  scorer: string | null;
  evaluatorId: string | null;
  /** evaluation_status.status integer key (0 pending, 2 in progress, -1 failed, ...). */
  status: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  timeTaken: number | null;
}
