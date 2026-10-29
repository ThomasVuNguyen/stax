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
import { compact, joinUrl, LANGCHAIN4J_TIMEOUT_MS, ndjson, request, requestJson } from "../LlmHttp";

/**
 * Port of OllamaStrategy (bean "ollama"; no ModelProvider value maps to it, kept for parity):
 * langchain4j OllamaChatModel -> `POST {model.url}/api/chat` with sampling options under
 * `options`; streaming is newline-delimited JSON. No API key is sent.
 */
interface OllamaOptions {
  baseUrl: string;
  modelName: string;
  options: {
    temperature?: number;
    top_k?: number;
    top_p?: number;
    seed?: number;
    num_predict?: number;
    num_ctx?: number;
    stop?: string[];
  };
}

export class OllamaStrategy extends ChatProviderStrategy {
  async chat(prompts: Prompt[]): Promise<ChatResponseWithLatency> {
    const client = ollamaChatModel(this.buildClientWithOptions());
    const messages = toLangChain4jMessages(prompts);
    return this.getResponseWithRetry(client, messages, DefaultRetryProperties);
  }

  override streamChat(prompts: Prompt[]): AsyncGenerator<StreamingChatResponse> {
    const client = ollamaStreamingChatModel(this.buildClientWithOptions());
    return this.buildStreamingChatResponse(client, prompts);
  }

  private buildClientWithOptions(): OllamaOptions {
    const p = this.properties;
    const o: OllamaOptions = { baseUrl: this.baseUrl ?? "", modelName: this.modelName, options: {} };
    if (Array.isArray(p["stop_sequences"]) && p["stop_sequences"].length > 0) o.options.stop = p["stop_sequences"];
    if (p["temperature"] != null) o.options.temperature = parseJavaDouble(p["temperature"]);
    if (p["top_p"] != null) o.options.top_p = parseJavaDouble(p["top_p"]);
    if (p["top_k"] != null) o.options.top_k = parseJavaInt(p["top_k"]);
    // containsKey in Java: a present null value fails to parse, as Integer.valueOf("null") did.
    if ("num_predict" in p) o.options.num_predict = parseJavaInt(p["num_predict"]);
    if ("seed" in p) o.options.seed = parseJavaInt(p["seed"]);
    if ("num_ctx" in p) o.options.num_ctx = parseJavaInt(p["num_ctx"]);
    return o;
  }
}

// --- langchain4j OllamaChatModel / OllamaStreamingChatModel over fetch ---

function requestBody(o: OllamaOptions, messages: ChatMessage[], stream: boolean) {
  const options = compact(o.options);
  return compact({
    model: o.modelName,
    messages: messages.map((m) => ({
      role: m.type === "SYSTEM" ? "system" : m.type === "AI" ? "assistant" : "user",
      content: m.text,
    })),
    options: Object.keys(options).length ? options : undefined,
    stream,
  });
}

function usageOf(r: any) {
  const input = r?.prompt_eval_count ?? null;
  const output = r?.eval_count ?? null;
  return {
    inputTokenCount: input,
    outputTokenCount: output,
    totalTokenCount: input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null,
  };
}

function ollamaChatModel(o: OllamaOptions): LangChain4jChatModel {
  return {
    async chat(messages) {
      const res = await requestJson(joinUrl(o.baseUrl, "api/chat"), {
        body: requestBody(o, messages, false),
        timeoutMs: LANGCHAIN4J_TIMEOUT_MS,
      });
      return { text: res?.message?.content ?? null, thinking: null, ...usageOf(res) };
    },
  };
}

function ollamaStreamingChatModel(o: OllamaOptions): LangChain4jStreamingChatModel {
  return {
    async *chat(messages): AsyncGenerator<LangChain4jStreamEvent> {
      const res = await request(joinUrl(o.baseUrl, "api/chat"), { body: requestBody(o, messages, true) });
      let text = "";
      let last: any = null;
      for await (const chunk of ndjson(res)) {
        if (chunk?.error) throw new Error(String(chunk.error));
        const token = chunk?.message?.content;
        if (typeof token === "string" && token.length > 0) {
          text += token;
          yield { type: "partial", token };
        }
        last = chunk;
        if (chunk?.done) break;
      }
      yield { type: "complete", response: { text: text || null, thinking: null, ...usageOf(last) } };
    },
  };
}
