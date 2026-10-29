import { newId } from "../lib/db";
import type { ModelProvider } from "../enums/ModelProvider";
import * as ModelProviderConverter from "../util/converter/ModelProviderConverter";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "inference_monitoring";
export const ID_PREFIX = "inference-monitoring-";

export interface InferenceMonitoring {
  id: string | null;
  modelProvider: ModelProvider | null;
  /** @ManyToOne Model model (model_id) */
  modelId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne EvaluationContainer container (container_id) */
  containerId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  turnTimeTaken: number | null;
  turnPromptTokens: number | null;
  turnCompletionTokens: number | null;
  turnTotalTokens: number | null;
  avgChatLatency: number | null;
  chatTotalPromptTokens: number | null;
  chatTotalCompletionTokens: number | null;
  chatTotalTokens: number | null;
  sequence: number | null;
  /** @Transient: previous turn's monitoring, used by the setters below. Never persisted. */
  previousInferenceMonitoring?: InferenceMonitoring | null;
}

export const COLUMNS: Record<Exclude<keyof InferenceMonitoring, "previousInferenceMonitoring">, string> = {
  id: "id",
  modelProvider: "model_provider",
  modelId: "model_id",
  userId: "user_id",
  containerId: "container_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  turnTimeTaken: "turn_time_taken",
  turnPromptTokens: "turn_prompt_tokens",
  turnCompletionTokens: "turn_completion_tokens",
  turnTotalTokens: "turn_total_tokens",
  avgChatLatency: "avg_chat_latency",
  chatTotalPromptTokens: "chat_total_prompt_tokens",
  chatTotalCompletionTokens: "chat_total_completion_tokens",
  chatTotalTokens: "chat_total_tokens",
  sequence: "sequence",
};

export function create(init: Partial<InferenceMonitoring> = {}): InferenceMonitoring {
  return {
    id: null,
    modelProvider: null,
    modelId: null,
    userId: null,
    containerId: null,
    createdAt: null,
    updatedAt: null,
    turnTimeTaken: null,
    turnPromptTokens: null,
    turnCompletionTokens: null,
    turnTotalTokens: null,
    avgChatLatency: null,
    chatTotalPromptTokens: null,
    chatTotalCompletionTokens: null,
    chatTotalTokens: null,
    sequence: null,
    ...init,
  };
}

/**
 * Java `new InferenceMonitoring(model, user, container, previousInferenceMonitoring)`:
 * provider from the model, sequence = previous.sequence + 1 (or 1).
 */
export function createForTurn(
  model: { id: string | null; provider: ModelProvider | null },
  userId: string | null,
  containerId: string | null,
  previousInferenceMonitoring: InferenceMonitoring | null,
): InferenceMonitoring {
  return create({
    modelId: model.id,
    modelProvider: model.provider,
    userId,
    containerId,
    previousInferenceMonitoring,
    sequence: previousInferenceMonitoring ? (previousInferenceMonitoring.sequence ?? 0) + 1 : 1,
  });
}

export function prePersist(e: InferenceMonitoring): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

/** `setTimetaken(turnTimeTaken)`: also updates the running average latency. */
export function setTimetaken(e: InferenceMonitoring, turnTimeTaken: number): void {
  const prev = e.previousInferenceMonitoring;
  e.turnTimeTaken = turnTimeTaken;
  e.avgChatLatency = prev
    ? ((prev.avgChatLatency ?? 0) * (prev.sequence ?? 0) + turnTimeTaken) / (e.sequence ?? 1)
    : turnTimeTaken;
}

export function setPromptTokens(e: InferenceMonitoring, turnPromptTokens: number): void {
  const prev = e.previousInferenceMonitoring;
  e.turnPromptTokens = turnPromptTokens;
  e.chatTotalPromptTokens = prev ? (prev.chatTotalPromptTokens ?? 0) + turnPromptTokens : turnPromptTokens;
}

export function setCompletionTokens(e: InferenceMonitoring, turnCompletionTokens: number): void {
  const prev = e.previousInferenceMonitoring;
  e.turnCompletionTokens = turnCompletionTokens;
  e.chatTotalCompletionTokens = prev
    ? (prev.chatTotalCompletionTokens ?? 0) + turnCompletionTokens
    : turnCompletionTokens;
}

export function setTotalTokens(e: InferenceMonitoring, turnTotalTokens: number): void {
  const prev = e.previousInferenceMonitoring;
  e.turnTotalTokens = turnTotalTokens;
  e.chatTotalTokens = prev ? (prev.chatTotalTokens ?? 0) + turnTotalTokens : turnTotalTokens;
}

/** `deepCopy(container)`: copies all metrics/model/user/sequence onto a new container. */
export function deepCopy(e: InferenceMonitoring, containerId: string | null): InferenceMonitoring {
  return create({
    avgChatLatency: e.avgChatLatency,
    chatTotalCompletionTokens: e.chatTotalCompletionTokens,
    chatTotalPromptTokens: e.chatTotalPromptTokens,
    chatTotalTokens: e.chatTotalTokens,
    modelId: e.modelId,
    modelProvider: e.modelProvider,
    containerId,
    sequence: e.sequence,
    userId: e.userId,
    turnCompletionTokens: e.turnCompletionTokens,
    turnPromptTokens: e.turnPromptTokens,
    turnTimeTaken: e.turnTimeTaken,
    turnTotalTokens: e.turnTotalTokens,
  });
}

export function fromRow(row: Row): InferenceMonitoring {
  return {
    id: str(row.id),
    modelProvider: ModelProviderConverter.convertToEntityAttribute(row.model_provider),
    modelId: str(row.model_id),
    userId: str(row.user_id),
    containerId: str(row.container_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    turnTimeTaken: num(row.turn_time_taken),
    turnPromptTokens: num(row.turn_prompt_tokens),
    turnCompletionTokens: num(row.turn_completion_tokens),
    turnTotalTokens: num(row.turn_total_tokens),
    avgChatLatency: num(row.avg_chat_latency),
    chatTotalPromptTokens: num(row.chat_total_prompt_tokens),
    chatTotalCompletionTokens: num(row.chat_total_completion_tokens),
    chatTotalTokens: num(row.chat_total_tokens),
    sequence: num(row.sequence),
  };
}

export function toRow(e: InferenceMonitoring): Record<string, Param> {
  return {
    id: e.id,
    model_provider: ModelProviderConverter.convertToDatabaseColumn(e.modelProvider),
    model_id: e.modelId,
    user_id: e.userId,
    container_id: e.containerId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    turn_time_taken: e.turnTimeTaken,
    turn_prompt_tokens: e.turnPromptTokens,
    turn_completion_tokens: e.turnCompletionTokens,
    turn_total_tokens: e.turnTotalTokens,
    avg_chat_latency: e.avgChatLatency,
    chat_total_prompt_tokens: e.chatTotalPromptTokens,
    chat_total_completion_tokens: e.chatTotalCompletionTokens,
    chat_total_tokens: e.chatTotalTokens,
    sequence: e.sequence,
  };
}

export function toJson(e: InferenceMonitoring): Record<string, unknown> {
  const { previousInferenceMonitoring: _prev, modelId: _m, userId: _u, containerId: _c, ...rest } = e;
  return rest;
}
