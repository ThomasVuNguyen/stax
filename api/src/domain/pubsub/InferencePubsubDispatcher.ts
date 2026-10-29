/**
 * Port of domain/pubsub/InferencePubsubDispatcher(+Impl). `dispatch(ctx, context, isBulk)`
 * covers both Java overloads (isBulk defaults to false).
 *
 * The provider switch is kept for its validation (OLLAMA/HUGGINGFACE were commented out in Java
 * and fall into `default`), even though every provider now goes to the same queue.
 * `checkDispatchable` is that validation alone, used when messages are collected and sent in a
 * batch (see InferencePublisherService outbox).
 */
import type { Ctx } from "../../lib/ctx";
import { IllegalArgumentException } from "../../lib/errors";
import { ModelProvider } from "../../enums/ModelProvider";
import type { InferenceContext } from "../inference/dto/InferenceContext";
import type { InferenceDTO } from "../inference/dto/InferenceDTO";
import * as Gateway from "./PubsubOutboundInferenceGateway";

type Sender = (ctx: Ctx, dto: InferenceDTO) => Promise<void>;

const SINGLE: Partial<Record<string, Sender>> = {
  [ModelProvider.OPENAI]: Gateway.sendToOpenAiInference,
  [ModelProvider.MISTRAL]: Gateway.sendToMistralInference,
  [ModelProvider.GOOGLE]: Gateway.sendToGeminiInference,
  [ModelProvider.ANTHROPIC]: Gateway.sendToAnthropicInference,
  [ModelProvider.GROK]: Gateway.sendToGrokInference,
  [ModelProvider.DEEPSEEK]: Gateway.sendToDeepSeekInference,
  [ModelProvider.LLAMA]: Gateway.sendToLlamaInference,
};

const BULK: Partial<Record<string, Sender>> = {
  [ModelProvider.OPENAI]: Gateway.sendToOpenAiInferenceBulk,
  [ModelProvider.MISTRAL]: Gateway.sendToMistralInferenceBulk,
  [ModelProvider.GOOGLE]: Gateway.sendToGeminiInferenceBulk,
  [ModelProvider.ANTHROPIC]: Gateway.sendToAnthropicInferenceBulk,
  [ModelProvider.GROK]: Gateway.sendToGrokInferenceBulk,
  [ModelProvider.DEEPSEEK]: Gateway.sendToDeepSeekInferenceBulk,
  [ModelProvider.LLAMA]: Gateway.sendToLlamaInferenceBulk,
};

function sender(context: InferenceContext, isBulk: boolean): Sender {
  const s = (isBulk ? BULK : SINGLE)[String(context.model.provider)];
  if (!s) throw new IllegalArgumentException("Unsupported model provider");
  return s;
}

export function checkDispatchable(context: InferenceContext, isBulk = false): void {
  sender(context, isBulk);
}

export async function dispatch(ctx: Ctx, context: InferenceContext, isBulk = false): Promise<void> {
  await sender(context, isBulk)(ctx, context.payload);
}
