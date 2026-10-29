/**
 * Port of analytics/inference/dto/InferenceMonitoringDTO (Taggable).
 * `new InferenceMonitoringDTO(im)` → `fromInferenceMonitoring(im)`; `tags` stays null until set.
 * Jackson emitted both the annotated field names and, for the oddly named `TurnPromptTokens`
 * field, the getter-derived property `turnPromptTokens` next to `turn_prompt_tokens`.
 */
import type { InferenceMonitoring } from "../../../../entities/InferenceMonitoring";
import { TagLinkTargetType } from "../../../../enums/TagLinkTargetType";
import type { TagDTO } from "../../../tags/dto/TagDTO";

export interface InferenceMonitoringDTO {
  id: string | null;
  turn_latency: number | null;
  turn_prompt_tokens: number | null;
  turnPromptTokens: number | null;
  turn_completion_tokens: number | null;
  turn_total_tokens: number | null;
  avg_chat_latency: number | null;
  chat_total_prompt_tokens: number | null;
  chat_total_completion_tokens: number | null;
  chat_total_tokens: number | null;
  tags: TagDTO[] | null;
}

export function fromInferenceMonitoring(im: InferenceMonitoring): InferenceMonitoringDTO {
  return {
    id: im.id,
    turn_latency: im.turnTimeTaken,
    turn_prompt_tokens: im.turnPromptTokens,
    turnPromptTokens: im.turnPromptTokens,
    turn_completion_tokens: im.turnCompletionTokens,
    turn_total_tokens: im.turnTotalTokens,
    avg_chat_latency: im.avgChatLatency,
    chat_total_prompt_tokens: im.chatTotalPromptTokens,
    chat_total_completion_tokens: im.chatTotalCompletionTokens,
    chat_total_tokens: im.chatTotalTokens,
    tags: null,
  };
}

export function getTagLinkTargetType(): TagLinkTargetType {
  return TagLinkTargetType.INFERENCE_MONITORING;
}
