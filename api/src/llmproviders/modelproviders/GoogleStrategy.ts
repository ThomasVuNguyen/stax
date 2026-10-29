import { DefaultRetryProperties } from "../../config/DefaultRetryProperties";
import { LlmProviderException, RuntimeException } from "../../lib/errors";
import { parseJavaBoolean, parseJavaDouble, parseJavaInt } from "../../util/NumberUtil";
import { executeWithRetry, statusResult } from "../../util/RetryUtils";
import { javaTrim } from "../../util/Util";
import { ChatProviderStrategy } from "../ChatProviderStrategy";
import {
  fromGenerateContentResponse,
  generateContentText,
  type ChatResponseWithLatency,
} from "../dto/ChatResponseWithLatency";
import type { Prompt } from "../dto/Prompt";
import { newStreamingChatResponse, newUsageInfo, type StreamingChatResponse } from "../dto/StreamingChatResponse";
import { errorMessage, LlmHttpError, request, requestJson, sseEvents } from "../LlmHttp";

/**
 * Port of GoogleStrategy (bean "google"): google-genai SDK ->
 * `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
 * (`:streamGenerateContent?alt=sse` for streaming), header x-goog-api-key. model.url is ignored,
 * as in Java. The last non-blank SYSTEM/DEVELOPER prompt becomes `systemInstruction`; the other
 * non-blank prompts become `contents` (ASSISTANT -> "model", others -> "user"). Model names are
 * remapped by resolveModelName(), and on a 404 the available models are listed and the closest
 * family member is tried once (resolveAvailableGeminiModel).
 * HTTP errors carry google-genai's ApiException message: "<code> <status>. <message>".
 */
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface Content {
  role: string;
  parts: { text: string }[];
}

export class GoogleStrategy extends ChatProviderStrategy {
  async chat(prompts: Prompt[]): Promise<ChatResponseWithLatency> {
    const { systemInstruction, contents } = buildContents(prompts);
    const config = this.getGenerationConfig(systemInstruction);
    const targetModel = resolveModelName(this.model.name);
    return this.getGeminiResponseWithRetry(targetModel, contents, config);
  }

  override async *streamChat(prompts: Prompt[]): AsyncGenerator<StreamingChatResponse> {
    const { systemInstruction, contents } = buildContents(prompts);
    const config = this.getGenerationConfig(systemInstruction);
    const startTime = Date.now();
    const targetModel = resolveModelName(this.model.name);
    let res: Response;
    try {
      try {
        res = await this.generateContentStream(targetModel, contents, config);
      } catch (e) {
        if (!(e instanceof LlmHttpError) || e.status !== 404) throw e;
        const fallbackModel = await this.resolveAvailableGeminiModel(targetModel);
        if (fallbackModel === targetModel) throw e;
        res = await this.generateContentStream(fallbackModel, contents, config);
      }
    } catch (e) {
      throw new LlmProviderException(`Error while sending request to Gemini API: ${errorMessage(e)}`);
    }

    for await (const ev of sseEvents(res)) {
      const contentResponse = JSON.parse(ev.data);
      checkFinishReason(contentResponse);
      const reason = finishReason(contentResponse);
      const out = newStreamingChatResponse({ content: "", isComplete: false, model: this.modelName });
      if (reason === "FINISH_REASON_UNSPECIFIED") {
        out.content = generateContentText(contentResponse);
      } else {
        out.isComplete = true;
        out.finishReason = reason;
        const chatResponse = fromGenerateContentResponse(contentResponse, Date.now() - startTime);
        out.content = chatResponse.reply;
        out.usage = newUsageInfo(chatResponse.promptTokens, chatResponse.turnCompletionTokens, chatResponse.totalTokens);
        out.latency = Date.now() - startTime;
      }
      // Only emit responses that have content OR are the final completion.
      if ((out.content !== null && out.content.length > 0) || out.isComplete) yield out;
    }
  }

  private headers() {
    return { "x-goog-api-key": this.apiKey };
  }

  private generateContent(model: string, contents: Content[], config: Record<string, unknown>): Promise<any> {
    return requestJson(`${GEMINI_BASE}/models/${model}:generateContent`, {
      headers: this.headers(),
      body: { contents, ...config },
      errorMessage: apiExceptionMessage,
    });
  }

  private generateContentStream(model: string, contents: Content[], config: Record<string, unknown>) {
    return request(`${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      headers: this.headers(),
      body: { contents, ...config },
      errorMessage: apiExceptionMessage,
    });
  }

  private async getGeminiResponseWithRetry(
    modelName: string,
    contents: Content[],
    config: Record<string, unknown>,
  ): Promise<ChatResponseWithLatency> {
    let latencyMs = 0;
    let geminiResponse: any;
    try {
      geminiResponse = await executeWithRetry(async () => {
        try {
          const startTime = Date.now();
          let response: any;
          try {
            response = await this.generateContent(modelName, contents, config);
          } catch (e) {
            if (!(e instanceof LlmHttpError) || e.status !== 404) throw e;
            const fallbackModel = await this.resolveAvailableGeminiModel(modelName);
            if (fallbackModel === modelName) throw e;
            response = await this.generateContent(fallbackModel, contents, config);
          }
          latencyMs = Date.now() - startTime;
          return statusResult<any>(response, 200);
        } catch (e) {
          if (e instanceof LlmHttpError) return statusResult<any>(null, e.status, e.message);
          return statusResult<any>(null, 500, errorMessage(e));
        }
      }, DefaultRetryProperties);
    } catch (e) {
      throw new LlmProviderException(`Error while sending request to Gemini API: ${errorMessage(e)}`);
    }
    return fromGenerateContentResponse(geminiResponse, latencyMs);
  }

  /** Lists the key's Gemini text models and picks a replacement for a 404'd model name. */
  private async resolveAvailableGeminiModel(requestedModel: string): Promise<string> {
    try {
      const available: string[] = [];
      let pageToken: string | undefined;
      do {
        const url = `${GEMINI_BASE}/models${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`;
        const page = await requestJson(url, { headers: this.headers(), errorMessage: apiExceptionMessage });
        for (const m of page?.models ?? []) {
          let fullName: string = m?.name ?? "";
          if (fullName.startsWith("models/")) fullName = fullName.substring(7);
          if (!fullName.startsWith("gemini-")) continue;
          if (
            ["-tts", "-image", "-transcribe", "-robotics", "-computer-use", "-embedding"].some((s) =>
              fullName.includes(s),
            )
          ) {
            continue;
          }
          const actions: string[] = m?.supportedActions ?? m?.supportedGenerationMethods ?? [];
          if (actions.length === 0 || actions.includes("generateContent")) available.push(fullName);
        }
        pageToken = page?.nextPageToken || undefined;
      } while (pageToken);

      console.info(
        `Gemini API 404 for '${requestedModel}'. Available text/chat Gemini models for this API key: [${available.join(", ")}]`,
      );
      if (available.length === 0) return requestedModel;
      if (requestedModel.includes("pro")) {
        if (available.includes("gemini-pro-latest")) return "gemini-pro-latest";
        const candidate = available.find((c) => c.includes("pro"));
        if (candidate) return candidate;
      }
      if (requestedModel.includes("lite")) {
        if (available.includes("gemini-2.5-flash-lite")) return "gemini-2.5-flash-lite";
        if (available.includes("gemini-flash-lite-latest")) return "gemini-flash-lite-latest";
        const candidate = available.find((c) => c.includes("lite"));
        if (candidate) return candidate;
      }
      if (requestedModel.includes("flash")) {
        if (available.includes("gemini-flash-latest")) return "gemini-flash-latest";
        if (available.includes("gemini-3.5-flash")) return "gemini-3.5-flash";
        const candidate = available.find((c) => c.includes("flash") && !c.includes("lite"));
        if (candidate) return candidate;
      }
      return available[0];
    } catch (e) {
      console.warn(`Failed to list available Gemini models during fallback resolution: ${errorMessage(e)}`);
      return requestedModel;
    }
  }

  /** GenerateContentConfig -> top-level `systemInstruction` + `generationConfig`. */
  private getGenerationConfig(systemInstruction: Content | null): Record<string, unknown> {
    const p = this.properties;
    const gc: Record<string, unknown> = {};
    if (p) {
      if (p["temperature"] != null) gc.temperature = parseJavaDouble(p["temperature"]);
      if (p["top_p"] != null) gc.topP = parseJavaDouble(p["top_p"]);
      if (p["seed"] != null) gc.seed = parseJavaInt(p["seed"]);
      if (p["max_tokens"] != null) gc.maxOutputTokens = parseJavaInt(p["max_tokens"]);
      else if (p["max_output_tokens"] != null) gc.maxOutputTokens = parseJavaInt(p["max_output_tokens"]);
      if (p["top_k"] != null) gc.topK = parseJavaDouble(p["top_k"]);
      if (p["presence_penalty"] != null) gc.presencePenalty = parseJavaDouble(p["presence_penalty"]);
      if (p["frequency_penalty"] != null) gc.frequencyPenalty = parseJavaDouble(p["frequency_penalty"]);
      if (p["response_log_probs"] != null) gc.responseLogprobs = parseJavaBoolean(p["response_log_probs"]);
      if (p["log_probs"] != null) {
        gc.logprobs = parseJavaInt(p["log_probs"]);
        gc.responseLogprobs = true;
      }
    }
    const targetModel = resolveModelName(this.modelName);
    if (targetModel.includes("thinking")) gc.thinkingConfig = { includeThoughts: true };

    const config: Record<string, unknown> = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (Object.keys(gc).length) config.generationConfig = gc;
    return config;
  }
}

function buildContents(prompts: Prompt[]): { systemInstruction: Content | null; contents: Content[] } {
  let systemInstruction: Content | null = null;
  const contents: Content[] = [];
  for (const prompt of prompts) {
    const hasText = prompt.text !== null && prompt.text !== undefined && javaTrim(prompt.text) !== "";
    if (prompt.role === "SYSTEM" || prompt.role === "DEVELOPER") {
      // Content.fromParts(...) builds a "user" content.
      if (hasText) systemInstruction = { role: "user", parts: [{ text: prompt.text as string }] };
      continue;
    }
    if (hasText) {
      contents.push({ role: prompt.role === "ASSISTANT" ? "model" : "user", parts: [{ text: prompt.text as string }] });
    }
  }
  if (contents.length === 0) contents.push({ role: "user", parts: [{ text: " " }] });
  return { systemInstruction, contents };
}

/** GenerateContentResponse.finishReason(): first candidate's reason, FINISH_REASON_UNSPECIFIED if absent. */
function finishReason(response: any): string {
  return response?.candidates?.[0]?.finishReason ?? "FINISH_REASON_UNSPECIFIED";
}

/** GenerateContentResponse.checkFinishReason(): only unspecified / STOP / MAX_TOKENS are accepted. */
function checkFinishReason(response: any) {
  const reason = finishReason(response);
  if (!["FINISH_REASON_UNSPECIFIED", "STOP", "MAX_TOKENS"].includes(reason)) {
    throw new RuntimeException(`The response finished unexpectedly with reason ${reason}.`);
  }
}

/** google-genai ApiException message: "<code> <status>. <message>". */
function apiExceptionMessage(code: number, statusText: string, body: string): string {
  try {
    const err = JSON.parse(body)?.error;
    if (err) return `${err.code ?? code} ${err.status ?? statusText}. ${err.message ?? ""}`;
  } catch {
    // not JSON
  }
  return `${code} ${statusText}. ${body}`;
}

export function resolveModelName(name: string | null | undefined): string {
  if (name === null || name === undefined || name.trim() === "") return "gemini-flash-latest";
  if (name === "gemini-2.5-flash") return "gemini-flash-latest";
  if (name === "gemini-2.5-pro") return "gemini-pro-latest";
  if (name.startsWith("gemini-2.0") || name.startsWith("gemini-1.5") || name === "gemini-flash" || name === "gemini-pro") {
    if (name.includes("pro")) return "gemini-pro-latest";
    if (name.includes("lite")) return "gemini-2.5-flash-lite";
    return "gemini-flash-latest";
  }
  if (name.startsWith("gemma-3")) return "gemma-4-31b-it";
  if (name.startsWith("learnlm")) return "gemini-flash-latest";
  return name;
}
