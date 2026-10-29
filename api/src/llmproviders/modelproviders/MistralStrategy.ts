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
 * Port of MistralStrategy (bean "mistral"): langchain4j MistralAiChatModel ->
 * `POST https://api.mistral.ai/v1/chat/completions` (model.url is not used, as in Java).
 */
interface MistralOptions {
  apiKey: string;
  modelName: string;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  temperature?: number;
  top_p?: number;
  random_seed?: number;
  stop?: string[];
}

export class MistralStrategy extends ChatProviderStrategy {
  async chat(prompts: Prompt[]): Promise<ChatResponseWithLatency> {
    const client = mistralChatModel(this.buildClientWithOptions());
    const messages = toLangChain4jMessages(prompts);
    return this.getResponseWithRetry(client, messages, DefaultRetryProperties);
  }

  override streamChat(prompts: Prompt[]): AsyncGenerator<StreamingChatResponse> {
    const client = mistralStreamingChatModel(this.buildClientWithOptions());
    return this.buildStreamingChatResponse(client, prompts);
  }

  private buildClientWithOptions(): MistralOptions {
    const p = this.properties;
    const options: MistralOptions = { apiKey: this.apiKey, modelName: resolveModelName(this.modelName) };
    const maxTokens = p["max_output_tokens"] != null ? p["max_output_tokens"] : p["max_tokens"];
    if (maxTokens != null) options.max_tokens = parseJavaInt(maxTokens);
    const freqPenalty = p["frequency_penalty"] != null ? p["frequency_penalty"] : p["frequence_penalty"];
    if (freqPenalty != null) options.frequency_penalty = parseJavaDouble(freqPenalty);
    if (p["presence_penalty"] != null) options.presence_penalty = parseJavaDouble(p["presence_penalty"]);
    if (p["temperature"] != null) options.temperature = parseJavaDouble(p["temperature"]);
    if (p["top_p"] != null) options.top_p = parseJavaDouble(p["top_p"]);
    if (p["seed"] != null) options.random_seed = parseJavaInt(p["seed"]);
    if (Array.isArray(p["stop_sequences"]) && p["stop_sequences"].length > 0) options.stop = p["stop_sequences"];
    return options;
  }
}

export function resolveModelName(name: string | null | undefined): string {
  if (name === null || name === undefined || name.trim() === "") return "mistral-small-latest";
  switch (name) {
    case "mistral-tiny":
    case "mistral-tiny-2312":
    case "mistral-small-2312":
      return "mistral-small-latest";
    case "mistral-medium-2312":
    case "mistral-medium":
      return "mistral-medium-latest";
    default:
      return name;
  }
}

// --- langchain4j MistralAiChatModel / MistralAiStreamingChatModel over fetch ---

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

function requestBody(o: MistralOptions, messages: ChatMessage[], stream: boolean) {
  return compact({
    model: o.modelName,
    messages: messages.map((m) => ({
      role: m.type === "SYSTEM" ? "system" : m.type === "AI" ? "assistant" : "user",
      content: m.text,
    })),
    temperature: o.temperature,
    max_tokens: o.max_tokens,
    top_p: o.top_p,
    random_seed: o.random_seed,
    stop: o.stop,
    presence_penalty: o.presence_penalty,
    frequency_penalty: o.frequency_penalty,
    stream,
  });
}

/** Message content is a string, or (reasoning models) an array of chunks of which the text ones count. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => c.text).join("");
  }
  return "";
}

function usageOf(u: any) {
  return {
    inputTokenCount: u?.prompt_tokens ?? null,
    outputTokenCount: u?.completion_tokens ?? null,
    totalTokenCount: u?.total_tokens ?? null,
  };
}

function mistralChatModel(o: MistralOptions): LangChain4jChatModel {
  return {
    async chat(messages) {
      const res = await requestJson(MISTRAL_URL, {
        headers: { Authorization: `Bearer ${o.apiKey}` },
        body: requestBody(o, messages, false),
        timeoutMs: LANGCHAIN4J_TIMEOUT_MS,
      });
      const text = textOf(res?.choices?.[0]?.message?.content);
      return { text: text || null, thinking: null, ...usageOf(res?.usage) };
    },
  };
}

function mistralStreamingChatModel(o: MistralOptions): LangChain4jStreamingChatModel {
  return {
    async *chat(messages): AsyncGenerator<LangChain4jStreamEvent> {
      const res = await request(MISTRAL_URL, {
        headers: { Authorization: `Bearer ${o.apiKey}` },
        body: requestBody(o, messages, true),
      });
      let text = "";
      let usage: any = null;
      for await (const ev of sseEvents(res)) {
        if (ev.data === "[DONE]") break;
        const chunk = JSON.parse(ev.data);
        if (chunk?.usage) usage = chunk.usage;
        const token = textOf(chunk?.choices?.[0]?.delta?.content);
        if (token) {
          text += token;
          yield { type: "partial", token };
        }
      }
      yield { type: "complete", response: { text: text || null, thinking: null, ...usageOf(usage) } };
    },
  };
}
