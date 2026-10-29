import { checkAtLeastOneField } from "../../../annotation/AtLeastOneFieldRequired";
import { InvalidDataException } from "../../../lib/errors";
import type { SXSPairEvaluationRequest } from "./SXSPairEvaluationRequest";

/** Port of domain/evaluation/dto/ChatTurnsEvaluationRequest (JSON names). */
export interface ChatTurnsEvaluationRequest {
  chat_turn_ids?: string[] | null;
  evaluator_ids?: string[] | null;
  pair_evaluations?: SXSPairEvaluationRequest[] | null;
}

/** @Valid: field errors first, then the class-level @AtLeastOneFieldRequired. */
export function validate(req: ChatTurnsEvaluationRequest): void {
  const errors: string[] = [];
  if (!req.evaluator_ids || !req.evaluator_ids.length) errors.push("evaluatorIds: Evaluator IDs cannot be empty");
  const global = checkAtLeastOneField(
    req,
    ["chat_turn_ids", "pair_evaluations"],
    "chatTurnsEvaluationRequest",
    "At least one of chatTurnIds or pairEvaluations must be provided",
  );
  if (global) errors.push(global);
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}
