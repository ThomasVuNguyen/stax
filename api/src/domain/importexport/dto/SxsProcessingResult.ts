import type { Chat } from "../../../entities/Chat";
import type { SxsEvaluationPair } from "../../../entities/SxsEvaluationPair";
import type { SXSHumanEvalRatingExportDTO } from "./SXSHumanEvalRatingExportDTO";
import type { TurnCreationResult } from "./TurnCreationResult";

/**
 * Port of the SxsProcessingResult record. `chats` holds the (unsaved) Chat of each turn result
 * (Java reached them through `turn.getChat()`).
 */
export interface SxsProcessingResult {
  pair: SxsEvaluationPair;
  turnResults: TurnCreationResult[];
  chats: Chat[];
  humanSxsRatings: SXSHumanEvalRatingExportDTO[];
}
