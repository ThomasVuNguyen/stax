import { DefaultRetryProperties } from "../../config/DefaultRetryProperties";
import { LlmProviderException } from "../../lib/errors";
import { parseJavaDouble, parseJavaLong } from "../../util/NumberUtil";
import { executeWithRetry, statusResult } from "../../util/RetryUtils";
import { ChatProviderStrategy } from "../ChatProviderStrategy";
import { fromOpenAiResponse, type ChatResponseWithLatency } from "../dto/ChatResponseWithLatency";
import type { Prompt } from "../dto/Prompt";
import { newStreamingChatResponse, newUsageInfo, type StreamingChatResponse } from "../dto/StreamingChatResponse";
import { compact, errorMessage, LlmHttpError, request, requestJson, sseEvents } from "../LlmHttp";

/**
 * Port of OpenAIStrategy (bean "openai"): openai-java Responses API ->
 * `POST https://api.openai.com/v1/responses` (the Java client only set the API key, so model.url
 * is ignored). Every prompt is sent (no empty-text filtering); ASSISTANT -> assistant,
 * SYSTEM -> system, any other role -> user. Reasoning models (o1/o3/o4*) get no temperature/top_p.
 *
 * Deviation: openai-java threw for HTTP errors, which RetryUtils retried regardless of status;
 * here HTTP failures are reported with their status so the configured include/exclude lists apply
 * (4xx are not retried). openai-java's own internal retries are not reproduced.
 */
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export class OpenAIStrategy extends ChatProviderStrategy {
  async chat(prompts: Prompt[]): Promise<ChatResponseWithLatency> {
    return this.getOpenAiResponseWithRetry(this.getParams(prompts));
  }

  override async *streamChat(prompts: Prompt[]): AsyncGenerator<StreamingChatResponse> {
    const params = { ...this.getParams(prompts), stream: true };
    const startTime = Date.now();
    let res: Response;
    try {
      res = await request(OPENAI_RESPONSES_URL, { headers: this.headers(), body: params, errorMessage: openAiError });
    } catch (e) {
      throw new LlmProviderException(`Error while sending request to OpenAI API: ${errorMessage(e)}`);
    }

    for await (const ev of sseEvents(res)) {
      if (ev.data === "[DONE]") break;
      const event = JSON.parse(ev.data);
      const type = event?.type ?? ev.event;
      const out = newStreamingChatResponse({ content: "", isComplete: false, model: this.modelName });
      if (type === "error") {
        out.isComplete = true;
        out.finishReason = event.message ?? null;
      } else if (type === "response.output_text.delta") {
        out.content = event.delta ?? "";
      } else if (type === "response.completed") {
        out.isComplete = true;
        out.finishReason = String(event.response?.status);
        const chatResponse = fromOpenAiResponse(event.response, Date.now() - startTime);
        out.content = chatResponse.reply;
        out.usage = newUsageInfo(chatResponse.promptTokens, chatResponse.turnCompletionTokens, chatResponse.totalTokens);
        out.latency = Date.now() - startTime;
      }
      // Only emit responses that have content OR are the final completion.
      if ((out.content !== null && out.content.length > 0) || out.isComplete) yield out;
    }
  }

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async getOpenAiResponseWithRetry(params: Record<string, unknown>): Promise<ChatResponseWithLatency> {
    let latencyMs = 0;
    let openAiResponse: any;
    try {
      openAiResponse = await executeWithRetry(async () => {
        const startTime = Date.now();
        try {
          const response = await requestJson(OPENAI_RESPONSES_URL, {
            headers: this.headers(),
            body: params,
            errorMessage: openAiError,
          });
          latencyMs = Date.now() - startTime;
          return statusResult<any>(response, 200);
        } catch (e) {
          if (e instanceof LlmHttpError) return statusResult<any>(null, e.status, e.message);
          throw e;
        }
      }, DefaultRetryProperties);
    } catch (e) {
      throw new LlmProviderException(`Error while sending request to Open AI API: ${errorMessage(e)}`);
    }
    return fromOpenAiResponse(openAiResponse, latencyMs);
  }

  private getParams(prompts: Prompt[]): Record<string, unknown> {
    const p = this.properties;
    const params: Record<string, unknown> = {
      input: prompts.map((m) => ({ role: mapMessageType(m.role), content: m.text })),
      model: this.modelName,
    };
    const maxTokens = p["max_output_tokens"] != null ? p["max_output_tokens"] : p["max_tokens"];
    if (maxTokens != null) params.max_output_tokens = parseJavaLong(maxTokens);
    if (!isReasoningModel(this.modelName)) {
      if (p["temperature"] != null) params.temperature = parseJavaDouble(p["temperature"]);
      if (p["top_p"] != null) params.top_p = parseJavaDouble(p["top_p"]);
    }
    if (p["top_logprobs"] != null) params.top_logprobs = parseJavaLong(p["top_logprobs"]);
    return compact(params);
  }
}

function isReasoningModel(model: string | null | undefined): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return lower.startsWith("o1") || lower.startsWith("o3") || lower.startsWith("o4");
}

function mapMessageType(role: string | null): "assistant" | "system" | "user" {
  if (role === "ASSISTANT") return "assistant";
  if (role === "SYSTEM") return "system";
  return "user";
}

/** openai-java service exception message: "<status>: <body>". */
function openAiError(status: number, _statusText: string, body: string): string {
  return `${status}: ${body}`;
}
