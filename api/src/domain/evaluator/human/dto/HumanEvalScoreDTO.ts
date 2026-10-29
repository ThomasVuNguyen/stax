/** Port of domain/evaluator/human/dto/HumanEvalScoreDTO (snake_case JSON, nulls written). */
import type { HumanEvalScore } from "../../../../entities/HumanEvalScore";
import type { HumanEvaluator } from "../../../../entities/HumanEvaluator";
import { ScoringMechanismType } from "../../../../enums/ScoringMechanismType";
import { convertJsonStringToList } from "../../../../util/ObjectMapperUtil";
import type { HumanCategoryOption } from "./HumanCategoryOption";

export interface HumanEvalScoreDTO {
  id: string | null;
  created_at: string | null;
  updated_at: string | null;
  score: number | null;
  notes: string | null;
  model_response_id: string | null;
  user_id: string | null;
  human_evaluator_id: string | null;
  category_name: string | null;
}

/** `new HumanEvalScoreDTO(score)`; `humanEvaluator` is the score's loaded evaluator. */
export function fromHumanEvalScore(score: HumanEvalScore, humanEvaluator: HumanEvaluator | null): HumanEvalScoreDTO {
  let categoryName: string | null = null;
  if (humanEvaluator && humanEvaluator.scoringMechanismType === ScoringMechanismType.CATEGORY) {
    const categories = convertJsonStringToList<HumanCategoryOption>(humanEvaluator.categories);
    const match = (categories ?? []).find((c) => c.score === score.score);
    if (match) categoryName = match.categoryName;
  }
  return {
    id: score.id,
    created_at: score.createdAt,
    updated_at: score.updatedAt,
    score: score.score,
    notes: score.notes,
    model_response_id: score.modelResponseId,
    user_id: score.userId,
    human_evaluator_id: score.humanEvaluatorId,
    category_name: categoryName,
  };
}
