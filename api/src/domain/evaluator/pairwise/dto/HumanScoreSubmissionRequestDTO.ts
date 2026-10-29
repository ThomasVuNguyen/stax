/** Port of domain/evaluator/pairwise/dto/HumanScoreSubmissionRequestDTO (unused by the API). */
import type { TagLinkTargetType } from "../../../../enums/TagLinkTargetType";

export interface HumanScoreSubmissionRequestDTO {
  targetType?: TagLinkTargetType | null;
  targetId?: string | null;
  humanEvaluatorId?: string | null;
  numericScore?: number | null;
  binaryScoreValue?: string | null;
  comment?: string | null;
}
