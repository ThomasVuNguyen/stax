/** Port of domain/project/dto/SXSEvaluationAnalyticsDTO (snake_case JSON). */
import type { ProjectEvaluationAnalyticsByScorer } from "../../analytics/evaluation/dto/ProjectEvaluationAnalyticsByScorer";

export interface SXSEvaluationAnalyticsDTO {
  side_a: ProjectEvaluationAnalyticsByScorer | null;
  side_b: ProjectEvaluationAnalyticsByScorer | null;
  /** Average score of side A minus side B. */
  delta: number | null;
  scorer_id: string | null;
  scorer_name: string | null;
}
