import type { ChatTurnDTO } from "../../domain/chatturn/dto/ChatTurnDTO";

/**
 * Port of llmproviders/dto/StreamingChatResponse. Field names are the JSON names. Every field is
 * always serialised (null included) except `finalChatDTO`, which is omitted when null
 * (@JsonInclude(NON_NULL)); use toJson() to get exactly what Jackson wrote.
 */
export interface UsageInfo {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface StreamingChatResponse {
  content: string | null;
  thinking: string | null;
  isComplete: boolean;
  usage: UsageInfo | null;
  model: string | null;
  finishReason: string | null;
  latency: number | null;
  finalChatDTO?: ChatTurnDTO | null;
}

/** `StreamingChatResponse.builder()...build()`: unset fields are null / false. */
export function newStreamingChatResponse(fields: Partial<StreamingChatResponse> = {}): StreamingChatResponse {
  return {
    content: null,
    thinking: null,
    isComplete: false,
    usage: null,
    model: null,
    finishReason: null,
    latency: null,
    ...fields,
  };
}

export function newUsageInfo(
  promptTokens: number | null,
  completionTokens: number | null,
  totalTokens: number | null,
): UsageInfo {
  return { promptTokens, completionTokens, totalTokens };
}

/** Jackson's output (declaration order, finalChatDTO only when non-null). */
export function toJson(r: StreamingChatResponse): Record<string, unknown> {
  const out: Record<string, unknown> = {
    content: r.content ?? null,
    thinking: r.thinking ?? null,
    isComplete: !!r.isComplete,
    usage: r.usage ?? null,
    model: r.model ?? null,
    finishReason: r.finishReason ?? null,
    latency: r.latency ?? null,
  };
  if (r.finalChatDTO !== null && r.finalChatDTO !== undefined) out.finalChatDTO = r.finalChatDTO;
  return out;
}
