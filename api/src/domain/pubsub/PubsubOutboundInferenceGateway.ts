/**
 * Port of domain/pubsub/PubsubOutboundInferenceGateway (@MessagingGateway). Every per-provider
 * and bulk Pub/Sub topic collapsed into the single Cloudflare Queue (`inference` job kind), so all
 * gateway methods publish the same way. `sendInferences` is the batched form (Queue.sendBatch).
 */
import type { Ctx } from "../../lib/ctx";
import { publish, publishAll } from "../../lib/queue";
import type { InferenceDTO } from "../inference/dto/InferenceDTO";

async function send(ctx: Ctx, inferenceDTO: InferenceDTO): Promise<void> {
  await publish(ctx.env, "inference", inferenceDTO);
}

export async function sendInferences(ctx: Ctx, inferenceDTOs: InferenceDTO[]): Promise<void> {
  if (inferenceDTOs.length) await publishAll(ctx.env, "inference", inferenceDTOs);
}

export const sendToOpenAiInference = send;
export const sendToGeminiInference = send;
export const sendToMistralInference = send;
export const sendToAnthropicInference = send;
export const sendToGrokInference = send;
export const sendToOllamaInference = send;
export const sendToDeepSeekInference = send;
export const sendToHuggingFaceInference = send;
export const sendToLlamaInference = send;

// BULK GATEWAYS
export const sendToOpenAiInferenceBulk = send;
export const sendToGeminiInferenceBulk = send;
export const sendToMistralInferenceBulk = send;
export const sendToAnthropicInferenceBulk = send;
export const sendToGrokInferenceBulk = send;
export const sendToOllamaInferenceBulk = send;
export const sendToDeepSeekInferenceBulk = send;
export const sendToHuggingFaceInferenceBulk = send;
export const sendToLlamaInferenceBulk = send;
