import { DefaultRetryProperties } from "../../config/DefaultRetryProperties";
import type { RetryConfig } from "../../config/RetryConfig";
import { parseJavaDouble, parseJavaInt } from "../../util/NumberUtil";
import {
  ChatProviderStrategy,
  type LangChain4jChatModel,
  type LangChain4jStreamEvent,
  type LangChain4jStreamingChatModel,
} from "../ChatProviderStrategy";
import type { ChatResponseWithLatency, LangChain4jChatResponse } from "../dto/ChatResponseWithLatency";
import type { Prompt } from "../dto/Prompt";
import { toLangChain4jMessages, type ChatMessage } from "../dto/PromptMessageAdapter";
import type { StreamingChatResponse } from "../dto/StreamingChatResponse";
import { compact, joinUrl, LANGCHAIN4J_TIMEOUT_MS, request, requestJson, sseEvents } from "../LlmHttp";

/**
 * Port of OpenAiCommonStrategy: providers reached through langchain4j's OpenAiChatModel, i.e. the
 * OpenAI-compatible `POST {model.url}/chat/completions` (DeepSeek, Grok, HuggingFace, Llama).
 * The langchain4j builder becomes an OpenAiChatOptions object; subclasses add their options in
 * buildClientWithOptions() / buildStreamingClientWithOptions().
 */
export interface OpenAiChatOptions {
  apiKey: string;
  baseUrl: string | null;
  modelName: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  stop?: string[];
  /** langchain4j returnThinking(true): read `reasoning_content` into the thinking field. */
  returnThinking?: boolean;
}

export abstract class OpenAiCommonStrategy extends ChatProviderStrategy {
  protected readonly retryConfig: RetryConfig = DefaultRetryProperties;

  async chat(prompts: Prompt[]): Promise<ChatResponseWithLatency> {
    const messages = toLangChain4jMessages(prompts);
    const client = openAiChatModel(this.buildClientWithOptions());
    return this.getResponseWithRetry(client, messages, this.retryConfig);
  }

  override streamChat(prompts: Prompt[]): AsyncGenerator<StreamingChatResponse> {
    const client = openAiStreamingChatModel(this.buildStreamingClientWithOptions());
    return this.buildStreamingChatResponse(client, prompts);
  }

  protected getBuilderWithCommonOptions(): OpenAiChatOptions {
    const options: OpenAiChatOptions = { apiKey: this.apiKey, baseUrl: this.baseUrl, modelName: this.modelName };
    if (this.properties["temperature"] != null) options.temperature = parseJavaDouble(this.properties["temperature"]);
    if (this.properties["top_p"] != null) options.top_p = parseJavaDouble(this.properties["top_p"]);
    const maxTokens = this.resolveMaxTokens();
    if (maxTokens !== null) options.max_completion_tokens = maxTokens;
    options.returnThinking = true;
    return options;
  }

  /** The streaming builder sets the same options (it just has no maxRetries). */
  protected getStreamingBuilderWithCommonOptions(): OpenAiChatOptions {
    return this.getBuilderWithCommonOptions();
  }

  protected resolveMaxTokens(): number | null {
    let val = this.properties["max_output_tokens"];
    if (val == null) val = this.properties["max_tokens"];
    if (val == null) val = this.properties["max_completion_tokens"];
    return val != null ? parseJavaInt(val) : null;
  }

  protected resolveFrequencyPenalty(): number | null {
    let val = this.properties["frequency_penalty"];
    if (val == null) val = this.properties["frequence_penalty"];
    return val != null ? parseJavaDouble(val) : null;
  }

  /**
   * Options shared by DeepSeek / Grok / HuggingFace: max_tokens (on top of max_completion_tokens),
   * frequency/presence penalty, seed, stop sequences.
   */
  protected applyExtendedOptions(options: OpenAiChatOptions): OpenAiChatOptions {
    const maxTokens = this.resolveMaxTokens();
    if (maxTokens !== null) options.max_tokens = maxTokens;
    const frequencyPenalty = this.resolveFrequencyPenalty();
    if (frequencyPenalty !== null) options.frequency_penalty = frequencyPenalty;
    if (this.properties["presence_penalty"] != null) {
      options.presence_penalty = parseJavaDouble(this.properties["presence_penalty"]);
    }
    if (this.properties["seed"] != null) options.seed = parseJavaInt(this.properties["seed"]);
    const stop = this.properties["stop_sequences"];
    if (Array.isArray(stop) && stop.length > 0) options.stop = stop as string[];
    return options;
  }

  protected abstract buildClientWithOptions(): OpenAiChatOptions;

  protected abstract buildStreamingClientWithOptions(): OpenAiChatOptions;
}

// --- langchain4j OpenAiChatModel / OpenAiStreamingChatModel over fetch ---

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

function toOpenAiMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.type === "SYSTEM" ? "system" : m.type === "AI" ? "assistant" : "user",
    content: m.text,
  }));
}

function requestBody(o: OpenAiChatOptions, messages: ChatMessage[], stream: boolean) {
  return compact({
    model: o.modelName,
    messages: toOpenAiMessages(messages),
    temperature: o.temperature,
    top_p: o.top_p,
    stream,
    stream_options: stream ? { include_usage: true } : undefined,
    stop: o.stop,
    max_tokens: o.max_tokens,
    max_completion_tokens: o.max_completion_tokens,
    presence_penalty: o.presence_penalty,
    frequency_penalty: o.frequency_penalty,
    seed: o.seed,
  });
}

function endpoint(o: OpenAiChatOptions) {
  return joinUrl(o.baseUrl || OPENAI_DEFAULT_BASE_URL, "chat/completions");
}

function headers(o: OpenAiChatOptions): Record<string, string> {
  return o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {};
}

function usageOf(u: any): Pick<LangChain4jChatResponse, "inputTokenCount" | "outputTokenCount" | "totalTokenCount"> {
  return {
    inputTokenCount: u?.prompt_tokens ?? null,
    outputTokenCount: u?.completion_tokens ?? null,
    totalTokenCount: u?.total_tokens ?? null,
  };
}

export function openAiChatModel(o: OpenAiChatOptions): LangChain4jChatModel {
  return {
    async chat(messages) {
      const res = await requestJson(endpoint(o), {
        headers: headers(o),
        body: requestBody(o, messages, false),
        timeoutMs: LANGCHAIN4J_TIMEOUT_MS,
      });
      const message = res?.choices?.[0]?.message ?? {};
      return {
        text: typeof message.content === "string" ? message.content : null,
        thinking: o.returnThinking ? (message.reasoning_content ?? null) : null,
        ...usageOf(res?.usage),
      };
    },
  };
}

export function openAiStreamingChatModel(o: OpenAiChatOptions): LangChain4jStreamingChatModel {
  return {
    async *chat(messages): AsyncGenerator<LangChain4jStreamEvent> {
      const res = await request(endpoint(o), { headers: headers(o), body: requestBody(o, messages, true) });
      let text = "";
      let usage: any = null;
      for await (const ev of sseEvents(res)) {
        if (ev.data === "[DONE]") break;
        const chunk = JSON.parse(ev.data);
        if (chunk?.error) throw new Error(JSON.stringify(chunk.error));
        if (chunk?.usage) usage = chunk.usage;
        const content = chunk?.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content.length > 0) {
          text += content;
          yield { type: "partial", token: content };
        }
      }
      yield { type: "complete", response: { text: text || null, thinking: null, ...usageOf(usage) } };
    },
  };
}
