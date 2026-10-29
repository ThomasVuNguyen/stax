import * as ApiKeysService from "../domain/apikeys/service/ApiKeysService";
import type { Model } from "../entities/Model";
import type { User } from "../entities/User";
import type { Ctx } from "../lib/ctx";
import { IllegalInputException } from "../lib/errors";
import type { ChatProviderStrategy } from "./ChatProviderStrategy";
import { AnthropicStrategy } from "./modelproviders/AnthropicStrategy";
import { DeepSeekStrategy } from "./modelproviders/DeepSeekStrategy";
import { GoogleStrategy } from "./modelproviders/GoogleStrategy";
import { GrokStrategy } from "./modelproviders/GrokStrategy";
import { HuggingFaceStrategy } from "./modelproviders/HuggingFaceStrategy";
import { LlamaStrategy } from "./modelproviders/LlamaStrategy";
import { MistralStrategy } from "./modelproviders/MistralStrategy";
import { OllamaStrategy } from "./modelproviders/OllamaStrategy";
import { OpenAIStrategy } from "./modelproviders/OpenAIStrategy";

/**
 * Port of llmproviders/ChatProviderFactory.
 *
 * USAGE (inference / evaluation code):
 *
 *   import * as ChatProviderFactory from "../../llmproviders/ChatProviderFactory";
 *   const strategy = await ChatProviderFactory.getStrategy(ctx, model, user);
 *
 *   // blocking call, with RetryUtils + DefaultRetryProperties inside; throws LlmProviderException
 *   // ("Error while sending request to <provider>: <upstream detail>") once retries are exhausted
 *   const res: ChatResponseWithLatency = await strategy.chat(prompts);
 *   // res = { reply, thinking, turnCompletionTokens, promptTokens, totalTokens, latencyMillis }
 *
 *   // streaming: Flux<StreamingChatResponse> became an AsyncGenerator<StreamingChatResponse>.
 *   // Chunks: { content, isComplete:false, ... } then one { isComplete:true, usage, finishReason, latency }.
 *   // Errors are thrown from the iteration (LlmProviderException "Error while streaming: ..." /
 *   // "Error while sending request to ... API: ..."). Serialise chunks with StreamingChatResponse.toJson().
 *   for await (const chunk of strategy.streamChat(prompts)) { ... }
 *
 * `prompts` are dto/Prompt objects `{ role: InputRole, text }` (fromModelInput / fromModelResponse).
 *
 * getStrategy() picks the strategy by `model.provider.toLowerCase()` (the Spring bean names),
 * gives it the model, loads the user's *encrypted* key with ApiKeysService.getApiKeyForUser(ctx,
 * provider, user) and decrypts it (custom endpoints use the key stored in the model properties).
 * Every call returns a fresh instance (Spring prototype scope).
 */

const STRATEGIES: Record<string, () => ChatProviderStrategy> = {
  openai: () => new OpenAIStrategy(),
  mistral: () => new MistralStrategy(),
  google: () => new GoogleStrategy(),
  anthropic: () => new AnthropicStrategy(),
  grok: () => new GrokStrategy(),
  deepseek: () => new DeepSeekStrategy(),
  llama: () => new LlamaStrategy(),
  // Beans without a ModelProvider value; unreachable through getStrategy, kept for parity.
  ollama: () => new OllamaStrategy(),
  huggingface: () => new HuggingFaceStrategy(),
};

export async function getStrategy(ctx: Ctx, model: Model, user: User): Promise<ChatProviderStrategy> {
  const factory = STRATEGIES[String(model.provider).toLowerCase()];
  if (!factory) {
    console.error(`No bean found for provider: ${model.provider}`);
    throw new IllegalInputException(`No bean found for provider: ${model.provider}`);
  }
  const provider = factory();
  provider.setModel(model);
  const apiKey = await ApiKeysService.getApiKeyForUser(ctx, model.provider, user);
  await provider.setApiKey(ctx.env, apiKey);
  return provider;
}

/**
 * Same as getStrategy but with the encrypted API key supplied by the caller (no ApiKeysService
 * lookup). Useful in jobs that already loaded the key.
 */
export async function getStrategyWithApiKey(
  ctx: Pick<Ctx, "env">,
  model: Model,
  encryptedApiKey: string | null | undefined,
): Promise<ChatProviderStrategy> {
  const factory = STRATEGIES[String(model.provider).toLowerCase()];
  if (!factory) throw new IllegalInputException(`No bean found for provider: ${model.provider}`);
  const provider = factory();
  provider.setModel(model);
  await provider.setApiKey(ctx.env, encryptedApiKey);
  return provider;
}
