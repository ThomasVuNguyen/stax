import { RuntimeException } from "../../lib/errors";

/**
 * Port of llmproviders/dto/ChatResponseWithLatency. JSON (Lombok @Data) uses the same field names.
 * The Java constructors become factory functions:
 * - newChatResponseWithLatency(...)             — @AllArgsConstructor
 * - fromLangChain4j(response, latency)          — langchain4j ChatResponse (OpenAI-compatible,
 *                                                  Anthropic, Mistral, Ollama strategies)
 * - fromOpenAiResponse(response, latency)       — OpenAI Responses API JSON
 * - fromGenerateContentResponse(response, lat.) — Gemini generateContent JSON
 */
export interface ChatResponseWithLatency {
  reply: string | null;
  thinking: string | null;
  turnCompletionTokens: number | null;
  promptTokens: number | null;
  totalTokens: number | null;
  latencyMillis: number;
}

export function newChatResponseWithLatency(
  reply: string | null,
  thinking: string | null,
  turnCompletionTokens: number | null,
  promptTokens: number | null,
  totalTokens: number | null,
  latencyMillis: number,
): ChatResponseWithLatency {
  return { reply, thinking, turnCompletionTokens, promptTokens, totalTokens, latencyMillis };
}

/** What a langchain4j ChatResponse carried that the app used. */
export interface LangChain4jChatResponse {
  text: string | null;
  thinking: string | null;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokenCount: number | null;
}

export function fromLangChain4j(response: LangChain4jChatResponse, latencyMillis: number): ChatResponseWithLatency {
  return newChatResponseWithLatency(
    response.text,
    response.thinking,
    response.outputTokenCount,
    response.inputTokenCount,
    response.totalTokenCount,
    latencyMillis,
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** First `output_text` of the first message item; first reasoning summary as thinking. */
export function fromOpenAiResponse(response: any, latencyMillis: number): ChatResponseWithLatency {
  const output: any[] = Array.isArray(response?.output) ? response.output : [];
  const text = output
    .filter((item) => item?.type === "message")
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .find((c) => c?.type === "output_text");
  // Optional.get() on an empty stream.
  if (!text) throw new RuntimeException("No value present");
  const thinking =
    output
      .filter((item) => item?.type === "reasoning")
      .flatMap((item) => (Array.isArray(item.summary) ? item.summary : []))
      .map((s) => s?.text)[0] ?? null;
  const usage = response?.usage;
  return newChatResponseWithLatency(
    text.text ?? null,
    thinking,
    usage ? Math.trunc(usage.output_tokens ?? 0) : 0,
    usage ? Math.trunc(usage.input_tokens ?? 0) : 0,
    usage ? Math.trunc(usage.total_tokens ?? 0) : 0,
    latencyMillis,
  );
}

/** google-genai `GenerateContentResponse.text()`: non-thought text parts of the first candidate. */
export function generateContentText(response: any): string | null {
  const parts: any[] | undefined = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  let text = "";
  let any = false;
  for (const p of parts) {
    if (typeof p?.text !== "string" || p.thought === true) continue;
    any = true;
    text += p.text;
  }
  return any ? text : null;
}

export function fromGenerateContentResponse(response: any, latencyMillis: number): ChatResponseWithLatency {
  const parts: any[] = response?.candidates?.[0]?.content?.parts ?? [];
  const thinking = parts.find((p) => p?.thought === true && typeof p.text === "string")?.text ?? null;
  const usage = response?.usageMetadata;
  return newChatResponseWithLatency(
    generateContentText(response),
    thinking,
    usage ? (usage.candidatesTokenCount ?? 0) : 0,
    usage ? (usage.promptTokenCount ?? 0) : 0,
    usage ? (usage.totalTokenCount ?? 0) : 0,
    latencyMillis,
  );
}
