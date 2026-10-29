import { DefaultRetryProperties } from "../../config/DefaultRetryProperties";
import { parseJavaDouble, parseJavaInt } from "../../util/NumberUtil";
import {
  ChatProviderStrategy,
  type LangChain4jChatModel,
  type LangChain4jStreamEvent,
  type LangChain4jStreamingChatModel,
} from "../ChatProviderStrategy";
import type { ChatResponseWithLatency } from "../dto/ChatResponseWithLatency";
import type { Prompt } from "../dto/Prompt";
import { toLangChain4jMessages, type ChatMessage } from "../dto/PromptMessageAdapter";
import type { StreamingChatResponse } from "../dto/StreamingChatResponse";
import { compact, LANGCHAIN4J_TIMEOUT_MS, request, requestJson, sseEvents } from "../LlmHttp";

/**
 * Port of AnthropicStrategy (bean "anthropic"): langchain4j AnthropicChatModel ->
 * `POST https://api.anthropic.com/v1/messages` (model.url is not used, as in Java), headers
 * x-api-key + anthropic-version 2023-06-01. System prompts go to the top-level `system` blocks,
 * user/assistant turns to `messages`. max_tokens defaults to 4096.
 */
interface AnthropicOptions {
  apiKey: string;
  modelName: string;
  stop_sequences?: string[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens: number;
}

export class AnthropicStrategy extends ChatProviderStrategy {
  async chat(prompts: Prompt[]): Promise<ChatResponseWithLatency> {
    const client = anthropicChatModel(this.buildClientWithOptions());
    const messages = toLangChain4jMessages(prompts);
    return this.getResponseWithRetry(client, messages, DefaultRetryProperties);
  }

  override streamChat(prompts: Prompt[]): AsyncGenerator<StreamingChatResponse> {
    const client = anthropicStreamingChatModel(this.buildClientWithOptions());
    return this.buildStreamingChatResponse(client, prompts);
  }

  /** Same options for the blocking and the streaming client. */
  private buildClientWithOptions(): AnthropicOptions {
    const p = this.properties;
    const options: AnthropicOptions = {
      apiKey: this.apiKey,
      modelName: resolveModelName(this.modelName),
      max_tokens: 4096,
    };
    if (Array.isArray(p["stop_sequences"]) && p["stop_sequences"].length > 0) options.stop_sequences = p["stop_sequences"];
    if (p["temperature"] != null) options.temperature = parseJavaDouble(p["temperature"]);
    if (p["top_p"] != null) options.top_p = parseJavaDouble(p["top_p"]);
    if (p["top_k"] != null) options.top_k = parseJavaInt(p["top_k"]);
    const maxTokens = p["max_output_tokens"] != null ? p["max_output_tokens"] : p["max_tokens"];
    if (maxTokens != null) options.max_tokens = parseJavaInt(maxTokens);
    return options;
  }
}

export function resolveModelName(name: string | null | undefined): string {
  if (name === null || name === undefined || name.trim() === "") return "claude-3-5-sonnet-20241022";
  switch (name) {
    case "claude-3.7-sonnet":
    case "claude-3-7-sonnet":
      return "claude-3-7-sonnet-20250219";
    case "claude-3.5-sonnet":
    case "claude-3-5-sonnet":
      return "claude-3-5-sonnet-20241022";
    case "claude-3.5-haiku":
    case "claude-3-5-haiku":
      return "claude-3-5-haiku-20241022";
    case "claude-3-opus":
      return "claude-3-opus-20240229";
    case "claude-3-haiku":
      return "claude-3-haiku-20240307";
    case "claude-3-sonnet":
      return "claude-3-sonnet-20240229";
    case "claude-opus-4-20250514":
      return "claude-opus-4";
    case "claude-sonnet-4-20250514":
      return "claude-sonnet-4";
    default:
      return name;
  }
}

// --- langchain4j AnthropicChatModel / AnthropicStreamingChatModel over fetch ---

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function requestBody(o: AnthropicOptions, messages: ChatMessage[], stream: boolean) {
  const system = messages.filter((m) => m.type === "SYSTEM").map((m) => ({ type: "text", text: m.text }));
  return compact({
    model: o.modelName,
    messages: messages
      .filter((m) => m.type !== "SYSTEM")
      .map((m) => ({ role: m.type === "AI" ? "assistant" : "user", content: [{ type: "text", text: m.text }] })),
    system: system.length ? system : undefined,
    max_tokens: o.max_tokens,
    stop_sequences: o.stop_sequences,
    stream,
    temperature: o.temperature,
    top_p: o.top_p,
    top_k: o.top_k,
  });
}

function headers(o: AnthropicOptions) {
  return { "x-api-key": o.apiKey, "anthropic-version": "2023-06-01" };
}

function anthropicChatModel(o: AnthropicOptions): LangChain4jChatModel {
  return {
    async chat(messages) {
      const res = await requestJson(ANTHROPIC_URL, {
        headers: headers(o),
        body: requestBody(o, messages, false),
        timeoutMs: LANGCHAIN4J_TIMEOUT_MS,
      });
      const blocks: any[] = Array.isArray(res?.content) ? res.content : [];
      const texts = blocks.filter((b) => b?.type === "text").map((b) => b.text);
      const input = res?.usage?.input_tokens ?? null;
      const output = res?.usage?.output_tokens ?? null;
      return {
        text: texts.length ? texts.join("\n") : null,
        thinking: null,
        inputTokenCount: input,
        outputTokenCount: output,
        totalTokenCount: input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null,
      };
    },
  };
}

function anthropicStreamingChatModel(o: AnthropicOptions): LangChain4jStreamingChatModel {
  return {
    async *chat(messages): AsyncGenerator<LangChain4jStreamEvent> {
      const res = await request(ANTHROPIC_URL, { headers: headers(o), body: requestBody(o, messages, true) });
      const texts = new Map<number, string>();
      let input: number | null = null;
      let output: number | null = null;
      for await (const ev of sseEvents(res)) {
        const data = JSON.parse(ev.data);
        const type = data?.type ?? ev.event;
        if (type === "message_start") {
          input = data.message?.usage?.input_tokens ?? input;
          output = data.message?.usage?.output_tokens ?? output;
        } else if (type === "content_block_start" && data.content_block?.type === "text") {
          texts.set(data.index, data.content_block.text ?? "");
        } else if (type === "content_block_delta" && data.delta?.type === "text_delta") {
          const token: string = data.delta.text ?? "";
          texts.set(data.index, (texts.get(data.index) ?? "") + token);
          if (token) yield { type: "partial", token };
        } else if (type === "message_delta") {
          output = data.usage?.output_tokens ?? output;
        } else if (type === "error") {
          throw new Error(JSON.stringify(data.error ?? data));
        } else if (type === "message_stop") {
          break;
        }
      }
      const parts = [...texts.entries()].sort(([a], [b]) => a - b).map(([, t]) => t);
      yield {
        type: "complete",
        response: {
          text: parts.length ? parts.join("\n") : null,
          thinking: null,
          inputTokenCount: input,
          outputTokenCount: output,
          totalTokenCount: input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null,
        },
      };
    },
  };
}
