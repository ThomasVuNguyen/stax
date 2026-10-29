/**
 * Port of domain/evaluation/dto/PairwiseScoreHelper. Scores must carry their `evaluationStatus`
 * and `llmEvaluator` (PairwiseLLMEvaluator) relations — see `withRelations(db, scores)`.
 *
 *   new PairwiseScoreHelper(scores, chatTurnA, chatTurnB).getPairwiseEvaluationScores()
 */
import { allIn } from "../../../lib/db";
import type { EvaluationStatus } from "../../../entities/EvaluationStatus";
import * as EvaluationStatusEntity from "../../../entities/EvaluationStatus";
import type { PairwiseLLMEvaluator } from "../../../entities/PairwiseLLMEvaluator";
import * as PairwiseLLMEvaluatorEntity from "../../../entities/PairwiseLLMEvaluator";
import type { PairwiseScore } from "../../../entities/PairwiseScore";
import { getValueByKey } from "../../../enums/EvaluationStatusEnum";
import {
  getCategory,
  getReasoning,
  resolveColor,
  setFailureReason,
  statusKeyString,
} from "../EvaluationScoreHelper";
import { type LLMEvaluationDTO, create as newLLMEvaluationDTO } from "./LLMEvaluationDTO";

export type PairwiseScoreWithRelations = PairwiseScore & {
  evaluationStatus?: EvaluationStatus | null;
  llmEvaluator?: PairwiseLLMEvaluator | null;
};

export async function withRelations(db: D1Database, scores: PairwiseScore[]): Promise<PairwiseScoreWithRelations[]> {
  const statusIds = [...new Set(scores.map((s) => s.evaluationStatusId).filter((x): x is string => !!x))];
  const evaluatorIds = [...new Set(scores.map((s) => s.llmEvaluatorId).filter((x): x is string => !!x))];
  const statuses = new Map(
    (await allIn(db, (inC) => `SELECT * FROM evaluation_status WHERE id IN ${inC}`, statusIds))
      .map(EvaluationStatusEntity.fromRow)
      .map((s) => [s.id, s] as const),
  );
  const evaluators = new Map(
    (await allIn(db, (inC) => `SELECT * FROM pairwise_llm_evaluator WHERE id IN ${inC}`, evaluatorIds))
      .map(PairwiseLLMEvaluatorEntity.fromRow)
      .map((e) => [e.id, e] as const),
  );
  return scores.map((s) => ({
    ...s,
    evaluationStatus: s.evaluationStatusId ? (statuses.get(s.evaluationStatusId) ?? null) : null,
    llmEvaluator: s.llmEvaluatorId ? (evaluators.get(s.llmEvaluatorId) ?? null) : null,
  }));
}

export class PairwiseScoreHelper {
  private readonly scores: Record<string, string | null> = {};
  private readonly pairwiseScoresList: PairwiseScoreWithRelations[];
  private readonly evaluationStatuses: Record<string, string> = {};

  constructor(
    scores: PairwiseScoreWithRelations[],
    chatTurnA: { id: string | null } | null | undefined,
    chatTurnB: { id: string | null } | null | undefined,
  ) {
    if (!chatTurnA || !chatTurnB) {
      this.pairwiseScoresList = [];
      return;
    }
    this.pairwiseScoresList = scores.filter(
      (s) => s.chatTurnAId != null && s.chatTurnAId === chatTurnA.id && s.chatTurnBId != null && s.chatTurnBId === chatTurnB.id,
    );
    for (const score of scores) {
      let evaluatorName: string | null = "Unknown Evaluator";
      let evaluationStatusValue = "";
      if (score.evaluationStatus) {
        evaluationStatusValue = statusKeyString(score.evaluationStatus);
        if (score.llmEvaluator) evaluatorName = score.llmEvaluator.name;
      }
      const key = String(evaluatorName);
      this.scores[key] = score.score != null ? score.score : score.llmResponse;
      this.evaluationStatuses[key] = evaluationStatusValue;
    }
  }

  getScores(): Record<string, string | null> {
    return this.scores;
  }

  getPairwiseScoresList(): PairwiseScoreWithRelations[] {
    return this.pairwiseScoresList;
  }

  getEvaluationStatuses(): Record<string, string> {
    return this.evaluationStatuses;
  }

  getPairwiseEvaluationScores(): Record<string, LLMEvaluationDTO> {
    const llmScores: Record<string, LLMEvaluationDTO> = {};
    for (const score of this.pairwiseScoresList) {
      if (!score.llmEvaluator) continue;
      const scoreValue = score.score;
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
