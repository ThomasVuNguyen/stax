/** Port of domain/evaluation/dto/ScoreDTO (legacy, unused by the API; camelCase JSON). */
export interface ScoreDTO {
  scoreStatusId: string | null;
  responseId: string | null;
  scorerId: string | null;
  userId: string | null;
  inputId: string | null;
  scorer: string | null;
  sourceAPI: string | null;
  comments: string | null;
  jobId: string | null;
}
