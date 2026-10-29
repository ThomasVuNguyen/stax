/**
 * Port of domain/tags/dto/TaggedEntitiesResponse (plain camelCase field names, nulls serialised).
 *
 * The Java constructor cast every CHAT entry to ChatTurnDTO and every INFERENCE_MONITORING entry
 * to EvaluationMonitoringDTO (it read INFERENCE_MONITORING twice), so a non-empty list of either
 * failed with a ClassCastException (500 RUNTIME_ERROR). That is reproduced.
 */
import { RuntimeException } from "../../../lib/errors";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import type { ChatTurnDTO } from "../../chatturn/dto/ChatTurnDTO";
import type { InferenceMonitoringDTO } from "../../chatturn/dto/ChatTurnDtoSupport";

export interface TaggedEntitiesResponse {
  chatTurns: ChatTurnDTO[] | null;
  chatTurnsByChat: ChatTurnDTO[] | null;
  inferenceMonitorings: InferenceMonitoringDTO[] | null;
  evaluationMonitorings: unknown[] | null;
}

const PKG = "com.planck.planck.domain";
function classCast(from: string, to: string): never {
  throw new RuntimeException(
    `class ${PKG}.${from} cannot be cast to class ${PKG}.${to} (${PKG}.${from} and ${PKG}.${to} are in unnamed module of loader 'app')`,
  );
}

export function newTaggedEntitiesResponse(result: Map<TagLinkTargetType, unknown[]>): TaggedEntitiesResponse {
  const response: TaggedEntitiesResponse = {
    chatTurns: null,
    chatTurnsByChat: null,
    inferenceMonitorings: null,
    evaluationMonitorings: null,
  };
  const chatTurns = result.get(TagLinkTargetType.CHAT_TURN);
  if (chatTurns) response.chatTurns = chatTurns as ChatTurnDTO[];

  const chats = result.get(TagLinkTargetType.CHAT);
  if (chats) {
    if (chats.length) classCast("chat.dto.ChatDTO", "chatturn.dto.ChatTurnDTO");
    response.chatTurnsByChat = [];
  }

  const inference = result.get(TagLinkTargetType.INFERENCE_MONITORING);
  if (inference) response.inferenceMonitorings = inference as InferenceMonitoringDTO[];
  if (inference) {
    if (inference.length) {
      classCast("analytics.inference.dto.InferenceMonitoringDTO", "analytics.evaluation.dto.EvaluationMonitoringDTO");
    }
    response.evaluationMonitorings = [];
  }
  return response;
}
