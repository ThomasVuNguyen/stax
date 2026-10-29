import type { Env } from "../env";
import { isCustomEndpoint, type Model } from "../entities/Model";
import type { RetryConfig } from "../config/RetryConfig";
import { ApiKeyIsMissingException, LlmProviderException, UnsupportedOperationException } from "../lib/errors";
import { decrypt } from "../util/EncryptionUtil";
import { convertJsonStringToMap } from "../util/ObjectMapperUtil";
import { executeWithRetry, statusResult } from "../util/RetryUtils";
import {
  fromLangChain4j,
  type ChatResponseWithLatency,
  type LangChain4jChatResponse,
} from "./dto/ChatResponseWithLatency";
import type { Prompt } from "./dto/Prompt";
import { toLangChain4jMessages, type ChatMessage } from "./dto/PromptMessageAdapter";
import { newStreamingChatResponse, newUsageInfo, type StreamingChatResponse } from "./dto/StreamingChatResponse";
import { errorMessage, LlmHttpError, LlmTimeoutError } from "./LlmHttp";

/**
 * Port of llmproviders/ChatProviderStrategy (abstract base of every provider strategy).
 * Obtain configured instances through ChatProviderFactory.getStrategy(); see that file for usage.
 *
 * Public API:
 *   chat(prompts): Promise<ChatResponseWithLatency>
 *   streamChat(prompts): AsyncGenerator<StreamingChatResponse>   (Flux -> async generator)
 *   setModel(model) / setApiKey(env, encryptedApiKey)            (done by the factory)
 */
export abstract class ChatProviderStrategy {
  protected properties: Record<string, any> = {};
  protected apiKey = "";
  protected modelName = "";
  protected model!: Model;
  protected baseUrl: string | null = null;
  protected chatCompletionsPath: string | null = null;

  setModel(model: Model): void {
    this.model = model;
    this.modelName = model.name ?? "";
    const raw = model.properties as unknown;
    this.properties =
      raw && typeof raw === "object" ? (raw as Record<string, any>) : (convertJsonStringToMap(raw as string | null) ?? {});
    this.baseUrl = model.url ?? null;
  }

  /**
   * `apiKey` is the user's *encrypted* key for the provider. Custom endpoints use the encrypted
   * key stored in the model properties (or "dummy").
   */
  async setApiKey(env: Pick<Env, "AES_SECRET_KEY">, apiKey: string | null | undefined): Promise<void> {
    if (isCustomEndpoint(this.model)) {
      this.apiKey =
        "encrypted_api_key" in this.properties
          ? await decrypt(env, this.properties["encrypted_api_key"] as string)
          : "dummy";
    } else if (apiKey !== null && apiKey !== undefined && apiKey.trim() !== "") {
      this.apiKey = await decrypt(env, apiKey);
    } else {
      throw new ApiKeyIsMissingException("API key must be set before calling chat()");
    }
  }

  abstract chat(prompts: Prompt[]): Promise<ChatResponseWithLatency>;

  /** Default: streaming not supported. Overridden by every shipped strategy. */
  // eslint-disable-next-line require-yield
  async *streamChat(_prompts: Prompt[]): AsyncGenerator<StreamingChatResponse> {
    throw new UnsupportedOperationException("Streaming not supported for this provider");
  }

  /**
   * Runs a langchain4j-style chat call under RetryUtils, classifying HTTP failures the way
   * langchain4j's exception mapper + the Java catch blocks did: 5xx -> 500, 401/403 -> 401,
   * 404 -> 404, timeout/408 -> 408, 429 -> 429, other 4xx -> 400; anything else is rethrown and
   * retried as an unknown status. Final failure: LlmProviderException("Error while sending
   * request to provider: <upstream detail>").
   */
  protected async getResponseWithRetry(
    client: LangChain4jChatModel,
    messages: ChatMessage[],
    retryProperties: RetryConfig,
  ): Promise<ChatResponseWithLatency> {
    let latencyMs = 0;
    let modelResponse: LangChain4jChatResponse;
    try {
      modelResponse = await executeWithRetry(async () => {
        try {
          const startTime = Date.now();
          const response = await client.chat(messages);
          latencyMs = Date.now() - startTime;
          return statusResult(response, 200);
        } catch (e) {
          const status = langChain4jStatus(e);
          if (status !== null) return statusResult<LangChain4jChatResponse>(null, status, errorMessage(e));
          throw new Error(errorMessage(e));
        }
      }, retryProperties);
    } catch (e) {
      throw new LlmProviderException(`Error while sending request to provider: ${errorMessage(e)}`);
    }
    return fromLangChain4j(modelResponse, latencyMs);
  }

  /**
   * langchain4j StreamingChatResponseHandler -> StreamingChatResponse chunks: one per partial token
   * (content, latency), then a final one with the full text, usage, finishReason "stop".
   */
  protected async *buildStreamingChatResponse(
    streamingModel: LangChain4jStreamingChatModel,
    prompts: Prompt[],
  ): AsyncGenerator<StreamingChatResponse> {
    const messages = toLangChain4jMessages(prompts);
    const startTime = Date.now();
    let events: AsyncIterator<LangChain4jStreamEvent>;
    try {
      events = streamingModel.chat(messages)[Symbol.asyncIterator]();
    } catch (e) {
      throw new LlmProviderException(`Error while streaming: ${errorMessage(e)}`);
    }
    for (;;) {
      let next: IteratorResult<LangChain4jStreamEvent>;
      try {
        next = await events.next();
      } catch (e) {
        throw new LlmProviderException(`Error while streaming: ${errorMessage(e)}`);
      }
      if (next.done) return;
      const ev = next.value;
      if (ev.type === "partial") {
        yield newStreamingChatResponse({
          content: ev.token,
          isComplete: false,
          model: this.modelName,
          latency: Date.now() - startTime,
        });
      } else {
        const r = ev.response;
        const hasUsage = r.inputTokenCount !== null || r.outputTokenCount !== null || r.totalTokenCount !== null;
        yield newStreamingChatResponse({
          content: r.text,
          isComplete: true,
          model: this.modelName,
          usage: hasUsage ? newUsageInfo(r.inputTokenCount, r.outputTokenCount, r.totalTokenCount) : null,
          finishReason: "stop",
          latency: Date.now() - startTime,
        });
        await events.return?.();
        return;
      }
    }
  }
}

/** A langchain4j ChatModel: one blocking chat call. */
export interface LangChain4jChatModel {
  chat(messages: ChatMessage[]): Promise<LangChain4jChatResponse>;
}

export type LangChain4jStreamEvent =
  | { type: "partial"; token: string }
  | { type: "complete"; response: LangChain4jChatResponse };

/** A langchain4j StreamingChatModel: partial tokens, then one complete response. */
export interface LangChain4jStreamingChatModel {
  chat(messages: ChatMessage[]): AsyncIterable<LangChain4jStreamEvent>;
}

function langChain4jStatus(e: unknown): number | null {
  if (e instanceof LlmTimeoutError) return 408;
  if (!(e instanceof LlmHttpError)) return null;
  const s = e.status;
  if (s >= 500 && s < 600) return 500;
  if (s === 401 || s === 403) return 401;
  if (s === 404) return 404;
  if (s === 408) return 408;
  if (s === 429) return 429;
  if (s >= 400 && s < 500) return 400;
  return null;
}
