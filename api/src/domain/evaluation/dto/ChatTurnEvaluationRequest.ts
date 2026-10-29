import { checkAtLeastOneField } from "../../../annotation/AtLeastOneFieldRequired";
import { InvalidDataException } from "../../../lib/errors";
import type { SXSPairEvaluationRequest } from "./SXSPairEvaluationRequest";

/** Port of domain/evaluation/dto/ChatTurnEvaluationRequest (JSON names). */
export interface ChatTurnEvaluationRequest {
  chat_turn_id?: string | null;
  sxs_pair?: SXSPairEvaluationRequest | null;
  evaluator_id?: string | null;
}

/** @Valid: field errors first, then the class-level @AtLeastOneFieldRequired. */
export function validate(req: ChatTurnEvaluationRequest): void {
  const errors: string[] = [];
  if (!req.evaluator_id) errors.push("evaluatorId: Evaluator ID cannot be empty");
  const global = checkAtLeastOneField(
    req,
    ["chat_turn_id", "sxs_pair"],
    "chatTurnEvaluationRequest",
    "Either chatTurnId or sxsPair must be provided",
  );
  if (global) errors.push(global);
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}
