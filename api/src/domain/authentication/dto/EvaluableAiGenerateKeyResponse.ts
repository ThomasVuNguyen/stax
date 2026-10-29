/** Port of authentication/dto/EvaluableAiGenerateKeyResponse (unused by any endpoint). */
export interface EvaluableAiGenerateKeyResponse {
  apiKey: string | null;
  reference: string | null;
  count: number;
}
