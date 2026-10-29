import { newId } from "../lib/db";
import type { ModelProvider } from "../enums/ModelProvider";
import * as ModelProviderConverter from "../util/converter/ModelProviderConverter";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "evaluation_monitoring";
export const ID_PREFIX = "evaluation-monitoring-";

export interface EvaluationMonitoring {
  id: string | null;
  /** column eval_model_provider */
  modelProvider: ModelProvider | null;
  /** @ManyToOne Model model (eval_model_id) */
  modelId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne EvaluationContainer container (container_id) */
  containerId: string | null;
  /** @ManyToOne LLMEvaluator evaluator (llm_evaluator_id) */
  evaluatorId: string | null;
  /** @ManyToOne PairwiseLLMEvaluator pairwiseEvaluator (pairwise_llm_evaluator_id) */
  pairwiseEvaluatorId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  timeTaken: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export const COLUMNS: Record<keyof EvaluationMonitoring, string> = {
  id: "id",
  modelProvider: "eval_model_provider",
  modelId: "eval_model_id",
  userId: "user_id",
  containerId: "container_id",
  evaluatorId: "llm_evaluator_id",
  pairwiseEvaluatorId: "pairwise_llm_evaluator_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  timeTaken: "time_taken",
  promptTokens: "prompt_tokens",
  completionTokens: "completion_tokens",
  totalTokens: "total_tokens",
};

export function create(init: Partial<EvaluationMonitoring> = {}): EvaluationMonitoring {
  return {
    id: null,
    modelProvider: null,
    modelId: null,
    userId: null,
    containerId: null,
    evaluatorId: null,
    pairwiseEvaluatorId: null,
    createdAt: null,
    updatedAt: null,
    timeTaken: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    ...init,
  };
}

export function prePersist(e: EvaluationMonitoring): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

/** `deepCopy()`: copies model, user, metrics and provider (not container/evaluators). */
export function deepCopy(e: EvaluationMonitoring): EvaluationMonitoring {
  return create({
    modelId: e.modelId,
    userId: e.userId,
    timeTaken: e.timeTaken,
    promptTokens: e.promptTokens,
    completionTokens: e.completionTokens,
    totalTokens: e.totalTokens,
    modelProvider: e.modelProvider,
  });
}

export function fromRow(row: Row): EvaluationMonitoring {
  return {
    id: str(row.id),
    modelProvider: ModelProviderConverter.convertToEntityAttribute(row.eval_model_provider),
    modelId: str(row.eval_model_id),
    userId: str(row.user_id),
    containerId: str(row.container_id),
    evaluatorId: str(row.llm_evaluator_id),
    pairwiseEvaluatorId: str(row.pairwise_llm_evaluator_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    timeTaken: num(row.time_taken),
    promptTokens: num(row.prompt_tokens),
    completionTokens: num(row.completion_tokens),
    totalTokens: num(row.total_tokens),
  };
}

export function toRow(e: EvaluationMonitoring): Record<string, Param> {
  return {
    id: e.id,
    eval_model_provider: ModelProviderConverter.convertToDatabaseColumn(e.modelProvider),
    eval_model_id: e.modelId,
    user_id: e.userId,
    container_id: e.containerId,
    llm_evaluator_id: e.evaluatorId,
    pairwise_llm_evaluator_id: e.pairwiseEvaluatorId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    time_taken: e.timeTaken,
    prompt_tokens: e.promptTokens,
    completion_tokens: e.completionTokens,
    total_tokens: e.totalTokens,
  };
}

export function toJson(e: EvaluationMonitoring): Record<string, unknown> {
  return {
    id: e.id,
    modelProvider: e.modelProvider,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    timeTaken: e.timeTaken,
    promptTokens: e.promptTokens,
    completionTokens: e.completionTokens,
    totalTokens: e.totalTokens,
  };
}
