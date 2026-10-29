/** Port of domain/project/dto/HumanEvalMetricsDTO (Map<Integer, Long> keys serialise as strings). */
export interface HumanEvalMetricsDTO {
  scoreCounts: Record<string, number> | null;
  /** Count of scores equal to 1 divided by the count of non-null, non-zero scores. */
  passRate: number | null;
}
