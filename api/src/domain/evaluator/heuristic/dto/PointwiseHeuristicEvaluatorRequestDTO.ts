/** Port of domain/evaluator/heuristic/dto/PointwiseHeuristicEvaluatorRequestDTO (JSON names). */
import { CriteriaType } from "../../../../enums/CriteriaType";
import { InvalidDataException } from "../../../../lib/errors";

export interface PointwiseHeuristicEvaluatorRequestDTO {
  name?: string | null;
  criteria?: string | null;
  /** Defaults to CONTAINS when absent (field initializer); an explicit null stays null. */
  criteria_type?: CriteriaType | null;
}

/** @Valid: @NotNull name / criteria. */
export function validate(req: PointwiseHeuristicEvaluatorRequestDTO): void {
  const errors: string[] = [];
  if (req.name == null) errors.push("name: Evaluator name cannot be null");
  if (req.criteria == null) errors.push("criteria: Criteria cannot be null");
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}

export function getCriteriaType(req: PointwiseHeuristicEvaluatorRequestDTO): CriteriaType | null {
  return "criteria_type" in req ? (req.criteria_type ?? null) : CriteriaType.CONTAINS;
}
