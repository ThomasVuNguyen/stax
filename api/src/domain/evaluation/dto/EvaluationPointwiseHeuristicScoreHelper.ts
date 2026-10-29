/**
 * Port of domain/evaluation/dto/EvaluationPointwiseHeuristicScoreHelper. Scores must carry their
 * `evaluationStatus` and `pointwiseEvaluator` relations — see `withRelations(db, scores)`.
 *
 *   const h = new EvaluationPointwiseHeuristicScoreHelper(scores);
 *   h.getEvaluationStatuses(); h.getPointwiseHeuristicScores();
 */
import { allIn } from "../../../lib/db";
import type { EvaluationStatus } from "../../../entities/EvaluationStatus";
import * as EvaluationStatusEntity from "../../../entities/EvaluationStatus";
import type { PointwiseHeuristicEvaluationScore } from "../../../entities/PointwiseHeuristicEvaluationScore";
import type { PointwiseHeuristicEvaluator } from "../../../entities/PointwiseHeuristicEvaluator";
import * as PointwiseHeuristicEvaluatorEntity from "../../../entities/PointwiseHeuristicEvaluator";
import { getValueByKey } from "../../../enums/EvaluationStatusEnum";
import { setFailureReason, statusKeyString } from "../EvaluationScoreHelper";
import {
  type PointwiseHeuristicEvaluationDTO,
  create as newPointwiseHeuristicEvaluationDTO,
} from "./PointwiseHeuristicEvaluationDTO";

export type PointwiseHeuristicEvaluationScoreWithRelations = PointwiseHeuristicEvaluationScore & {
  evaluationStatus?: EvaluationStatus | null;
  pointwiseEvaluator?: PointwiseHeuristicEvaluator | null;
};

export async function withRelations(
  db: D1Database,
  scores: PointwiseHeuristicEvaluationScore[],
): Promise<PointwiseHeuristicEvaluationScoreWithRelations[]> {
  const statusIds = [...new Set(scores.map((s) => s.evaluationStatusId).filter((x): x is string => !!x))];
  const evaluatorIds = [...new Set(scores.map((s) => s.pointwiseEvaluatorId).filter((x): x is string => !!x))];
  const statuses = new Map(
    (await allIn(db, (inC) => `SELECT * FROM evaluation_status WHERE id IN ${inC}`, statusIds))
      .map(EvaluationStatusEntity.fromRow)
      .map((s) => [s.id, s] as const),
  );
  const evaluators = new Map(
    (await allIn(db, (inC) => `SELECT * FROM pointwise_heuristic_evaluator WHERE id IN ${inC}`, evaluatorIds))
      .map(PointwiseHeuristicEvaluatorEntity.fromRow)
      .map((e) => [e.id, e] as const),
  );
  return scores.map((s) => ({
    ...s,
    evaluationStatus: s.evaluationStatusId ? (statuses.get(s.evaluationStatusId) ?? null) : null,
    pointwiseEvaluator: s.pointwiseEvaluatorId ? (evaluators.get(s.pointwiseEvaluatorId) ?? null) : null,
  }));
}

export class EvaluationPointwiseHeuristicScoreHelper {
  private readonly scoresList: PointwiseHeuristicEvaluationScoreWithRelations[];
  private readonly evaluationStatuses: Record<string, string> = {};

  constructor(scores: PointwiseHeuristicEvaluationScoreWithRelations[]) {
    this.scoresList = scores;
    for (const score of scores) {
      let evaluatorName: string | null = "Unknown Evaluator";
      let evaluationStatusValue = "";
      if (score.evaluationStatus) {
        evaluationStatusValue = statusKeyString(score.evaluationStatus);
        if (score.pointwiseEvaluator) evaluatorName = score.pointwiseEvaluator.name;
      }
      this.evaluationStatuses[String(evaluatorName)] = evaluationStatusValue;
    }
  }

  getScoresList(): PointwiseHeuristicEvaluationScoreWithRelations[] {
    return this.scoresList;
  }

  getEvaluationStatuses(): Record<string, string> {
    return this.evaluationStatuses;
  }

  getPointwiseHeuristicScores(): Record<string, PointwiseHeuristicEvaluationDTO> {
    const out: Record<string, PointwiseHeuristicEvaluationDTO> = {};
    for (const score of this.scoresList) {
      if (!score.pointwiseEvaluator) continue;
      const dto = newPointwiseHeuristicEvaluationDTO({
        evaluator_id: score.pointwiseEvaluator.id,
        match: score.isMatch,
      });
      let evaluationStatusValue = "";
      let evaluationStatusValueText: string | null = "";
      if (score.evaluationStatus?.status != null) {
        evaluationStatusValue = String(score.evaluationStatus.status);
        setFailureReason(score.evaluationStatus, dto, false);
        evaluationStatusValueText = getValueByKey(score.evaluationStatus.status);
      }
      dto.evaluationStatus = evaluationStatusValue;
      dto.evaluationStatusText = evaluationStatusValueText;
      out[String(score.pointwiseEvaluator.name)] = dto;
    }
    return out;
  }
}
