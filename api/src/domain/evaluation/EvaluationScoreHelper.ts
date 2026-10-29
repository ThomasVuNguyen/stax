/**
 * Port of domain/evaluation/EvaluationScoreHelper.
 *
 * The Java helper walked the JPA graph (`score.getEvaluationStatus()`, `score.getLlmEvaluator()`);
 * here the scores must carry those relations: pass `ScoreV2WithRelations[]`, e.g. built with
 * `await EvaluationScoreHelper.withRelations(db, scores)`.
 *
 *   const helper = new EvaluationScoreHelper(scores);
 *   helper.getScores(); helper.getEvaluationStatuses(); helper.getLLMScores();
 *
 * Maps are plain objects keyed by evaluator name (Java HashMap; iteration order differs).
 */
import { allIn } from "../../lib/db";
import type { EvaluationStatus } from "../../entities/EvaluationStatus";
import * as EvaluationStatusEntity from "../../entities/EvaluationStatus";
import type { LLMEvaluator } from "../../entities/LLMEvaluator";
import * as LLMEvaluatorEntity from "../../entities/LLMEvaluator";
import type { ScoreV2 } from "../../entities/ScoreV2";
import { EvaluationStatusEnum, getKey, getValueByKey } from "../../enums/EvaluationStatusEnum";
import { CATEGORY_PATTERN } from "../../util/EvaluationPatternUtil";
import { convertJsonStringToList } from "../../util/ObjectMapperUtil";
import { DEFAULT_EVALUATOR_CATEGORY_COLOR } from "../../util/PlanckConstants";
import type { OutputCategoryDTO } from "../evaluator/dto/OutputCategoryDTO";
import { type LLMEvaluationDTO, create as newLLMEvaluationDTO } from "./dto/LLMEvaluationDTO";

export const normalizationPattern = "[^a-zA-Z0-9]";

export type ScoreV2WithRelations = ScoreV2 & {
  evaluationStatus?: EvaluationStatus | null;
  llmEvaluator?: LLMEvaluator | null;
};

/** Java `Double.toString(d)` (used where Java concatenated / toString()-ed a Double). */
export function javaDoubleToString(d: number): string {
  if (Number.isNaN(d)) return "NaN";
  if (!Number.isFinite(d)) return d > 0 ? "Infinity" : "-Infinity";
  if (d === 0) return Object.is(d, -0) ? "-0.0" : "0.0";
  const abs = Math.abs(d);
  if (abs >= 1e-3 && abs < 1e7) {
    const s = String(d);
    return s.includes(".") ? s : `${s}.0`;
  }
  const [mant, exp] = d.toExponential().split("e");
  return `${mant.includes(".") ? mant : `${mant}.0`}E${Number(exp)}`;
}

/** Status key as Java `Integer.toString()`, "" when absent. */
export function statusKeyString(status: EvaluationStatus | null | undefined): string {
  return status?.status != null ? String(status.status) : "";
}

/** Loads the `evaluationStatus` / `llmEvaluator` relations of many scores in bulk. */
export async function withRelations(db: D1Database, scores: ScoreV2[]): Promise<ScoreV2WithRelations[]> {
  const statusIds = [...new Set(scores.map((s) => s.evaluationStatusId).filter((x): x is string => !!x))];
  const evaluatorIds = [...new Set(scores.map((s) => s.llmEvaluatorId).filter((x): x is string => !!x))];
  const statuses = new Map(
    (await allIn(db, (inC) => `SELECT * FROM evaluation_status WHERE id IN ${inC}`, statusIds))
      .map(EvaluationStatusEntity.fromRow)
      .map((s) => [s.id, s] as const),
  );
  const evaluators = new Map(
    (await allIn(db, (inC) => `SELECT * FROM llm_evaluator WHERE id IN ${inC}`, evaluatorIds))
      .map(LLMEvaluatorEntity.fromRow)
      .map((e) => [e.id, e] as const),
  );
  return scores.map((s) => ({
    ...s,
    evaluationStatus: s.evaluationStatusId ? (statuses.get(s.evaluationStatusId) ?? null) : null,
    llmEvaluator: s.llmEvaluatorId ? (evaluators.get(s.llmEvaluatorId) ?? null) : null,
  }));
}

/** Shared by the LLM / pairwise helpers: category color lookup on the evaluator's output categories. */
export function resolveColor(outputCategoriesJson: string | null, scoreValue: string | null): string {
  if (outputCategoriesJson == null || scoreValue == null) return DEFAULT_EVALUATOR_CATEGORY_COLOR;
  const outputCategories = convertJsonStringToList<OutputCategoryDTO>(outputCategoriesJson);
  if (outputCategories == null) return DEFAULT_EVALUATOR_CATEGORY_COLOR;
  return outputCategories.find((c) => scoreValue === c.value)?.color ?? DEFAULT_EVALUATOR_CATEGORY_COLOR;
}

export function getReasoning(llmResponse: string | null): string | null {
  if (!llmResponse) return null;
  const m = CATEGORY_PATTERN.exec(llmResponse);
  return m ? m[2].trim() : null;
}

export function getCategory(llmResponse: string | null): string | null {
  if (!llmResponse) return null;
  const m = CATEGORY_PATTERN.exec(llmResponse);
  return m ? m[1] : null;
}

/** setFailureReason(): only for FAILED statuses; comments win over reason (and fill reasoning). */
export function setFailureReason(
  status: EvaluationStatus,
  dto: { failureReason: string | null; reasoning?: string | null },
  fillReasoning: boolean,
): void {
  if (status.status !== getKey(EvaluationStatusEnum.FAILED)) return;
  if (status.comments != null) {
    dto.failureReason = status.comments;
    if (fillReasoning && dto.reasoning == null) dto.reasoning = status.comments;
    return;
  }
  dto.failureReason = status.reason;
}

export class EvaluationScoreHelper {
  private readonly scores: Record<string, string | null> = {};
  private readonly scoresList: ScoreV2WithRelations[];
  private readonly evaluationStatuses: Record<string, string> = {};

  constructor(scores: ScoreV2WithRelations[]) {
    this.scoresList = scores;
    for (const score of scores) {
      let evaluatorName: string | null = "Unknown Evaluator";
      let evaluationStatusValue = "";
      if (score.evaluationStatus) {
        evaluationStatusValue = statusKeyString(score.evaluationStatus);
        if (score.llmEvaluator) evaluatorName = score.llmEvaluator.name;
      }
      const key = String(evaluatorName);
      this.scores[key] = score.score != null ? javaDoubleToString(score.score) : score.llmResponse;
      this.evaluationStatuses[key] = evaluationStatusValue;
    }
  }

  getScores(): Record<string, string | null> {
    return this.scores;
  }

  getScoresList(): ScoreV2WithRelations[] {
    return this.scoresList;
  }

  getEvaluationStatuses(): Record<string, string> {
    return this.evaluationStatuses;
  }

  getLLMScores(): Record<string, LLMEvaluationDTO> {
    const llmScores: Record<string, LLMEvaluationDTO> = {};
    for (const score of this.scoresList) {
      if (!score.llmEvaluator) continue;
      const scoreValue = score.score != null ? javaDoubleToString(score.score) : null;
      const dto = newLLMEvaluationDTO({
        evaluator_id: score.llmEvaluator.id,
        score: scoreValue ?? "NaN",
        llmResponse: score.llmResponse,
        reasoning: getReasoning(score.llmResponse),
        category: getCategory(score.llmResponse),
        color: resolveColor(score.llmEvaluator.outputCategories, scoreValue),
      });
      let evaluationStatusValue = "";
      let evaluationStatusValueText: string | null = "";
      if (score.evaluationStatus?.status != null) {
        evaluationStatusValue = String(score.evaluationStatus.status);
        setFailureReason(score.evaluationStatus, dto, true);
        evaluationStatusValueText = getValueByKey(score.evaluationStatus.status);
      }
      dto.evaluationStatus = evaluationStatusValue;
      dto.evaluationStatusText = evaluationStatusValueText;
      llmScores[String(score.llmEvaluator.name)] = dto;
    }
    return llmScores;
  }
}
