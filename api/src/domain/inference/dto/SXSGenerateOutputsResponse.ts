/** Port of domain/inference/dto/SXSGenerateOutputsResponse (camelCase JSON, nulls included). */
export interface SXSGenerateOutputsResponse {
  newSxsPairIds: string[] | null;
  failedSxsPairIds: string[] | null;
  skippedSxsPairIds: string[] | null;
}
