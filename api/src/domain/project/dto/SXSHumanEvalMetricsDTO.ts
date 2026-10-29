/** Port of domain/project/dto/SXSHumanEvalMetricsDTO. */
import type { HumanSxsRating } from "../../../enums/HumanSxsRating";

export interface SXSHumanEvalMetricsDTO {
  ratingCounts: Partial<Record<HumanSxsRating, number>> | null;
  total: number | null;
}
