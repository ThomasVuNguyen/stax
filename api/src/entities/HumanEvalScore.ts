import { newId, parseJson } from "../lib/db";
import { IllegalInputException } from "../lib/errors";
import { ScoringMechanismType } from "../enums/ScoringMechanismType";
import { type Param, type Row, num, str } from "./EntitySupport";
import type { HumanEvaluator } from "./HumanEvaluator";

export const TABLE = "human_scores";
export const ID_PREFIX = "human-eval-score-";

export interface HumanEvalScore {
  id: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  score: number | null;
  notes: string | null;
  /** @ManyToOne ModelResponse modelResponse (model_response_id) */
  modelResponseId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne HumanEvaluator humanEvaluator (human_evaluator_id) */
  humanEvaluatorId: string | null;
}

export const COLUMNS: Record<keyof HumanEvalScore, string> = {
  id: "id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  score: "score",
  notes: "notes",
  modelResponseId: "model_response_id",
  userId: "user_id",
  humanEvaluatorId: "human_evaluator_id",
};

export function create(init: Partial<HumanEvalScore> = {}): HumanEvalScore {
  return {
    id: null,
    createdAt: null,
    updatedAt: null,
    score: null,
    notes: null,
    modelResponseId: null,
    userId: null,
    humanEvaluatorId: null,
    ...init,
  };
}

export function prePersist(e: HumanEvalScore): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

/** `getScoreData()` map (snake_case keys, as built in Java). */
export function getScoreData(e: HumanEvalScore): Record<string, unknown> {
  return {
    id: e.id,
    score: e.score,
    human_evaluator_id: e.humanEvaluatorId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/**
 * `setScore(score, humanEvaluator)`: for CATEGORY evaluators the score must equal one of the
 * category scores, else IllegalInputException.
 */
export function setScore(e: HumanEvalScore, score: number | null, humanEvaluator: HumanEvaluator): void {
  if (humanEvaluator.scoringMechanismType === ScoringMechanismType.CATEGORY) {
    const categories = parseJson<{ score?: number | null }[]>(humanEvaluator.categories);
    if (Array.isArray(categories) && categories.length) {
      if (!categories.some((c) => c.score != null && c.score === score)) {
        throw new IllegalInputException(
          "Invalid score for category-based evaluator. Score must match one of the defined categories.",
        );
      }
    }
  }
  e.humanEvaluatorId = humanEvaluator.id;
  e.score = score;
}

/** `deepCopy(modelResponse)`: same score/evaluator/user/notes on another model response. */
export function deepCopy(e: HumanEvalScore, modelResponseId: string | null): HumanEvalScore {
  return create({
    modelResponseId,
    score: e.score,
    humanEvaluatorId: e.humanEvaluatorId,
    userId: e.userId,
    notes: e.notes,
  });
}

export function fromRow(row: Row): HumanEvalScore {
  return {
    id: str(row.id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    score: num(row.score),
    notes: str(row.notes),
    modelResponseId: str(row.model_response_id),
    userId: str(row.user_id),
    humanEvaluatorId: str(row.human_evaluator_id),
  };
}

export function toRow(e: HumanEvalScore): Record<string, Param> {
  return {
    id: e.id,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    score: e.score,
    notes: e.notes,
    model_response_id: e.modelResponseId,
    user_id: e.userId,
    human_evaluator_id: e.humanEvaluatorId,
  };
}

/** Scalar fields + getter `scoreData`; callers add modelResponse/user/humanEvaluator. */
export function toJson(e: HumanEvalScore): Record<string, unknown> {
  return {
    id: e.id,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    score: e.score,
    notes: e.notes,
    scoreData: getScoreData(e),
  };
}
