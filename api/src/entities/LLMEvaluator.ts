import { bool, newId, toBool } from "../lib/db";
import type { ScopeType } from "../enums/ScopeType";
import type { ScoreType } from "../enums/ScoreType";
import * as ScopeTypeConverter from "../util/converter/ScopeTypeConverter";
import * as ScoreTypeConverter from "../util/converter/ScoreTypeConverter";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "llm_evaluator";
export const ID_PREFIX = "llm-eval-";
/** @ManyToMany(EAGER) inputs join table (turn_id = evaluator id, input_id = model_input id). */
export const INPUTS_JOIN_TABLE = "llm_turn_inputs";

/**
 * `inputs` (List<ModelInput>, EAGER via llm_turn_inputs) is not on the interface: load with
 * `LLMEvaluatorRepository.findInputsByEvaluatorId(db, id)` and replace with `saveInputs`.
 */
export interface LLMEvaluator {
  id: string | null;
  /** unique */
  name: string | null;
  outputFormatType: ScoreType | null;
  type: ScopeType | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  description: string | null;
  /** JSON text */
  variables: string | null;
  /** JSON text */
  outputCategories: string | null;
  /** @ManyToOne Model model (model_id) */
  modelId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** column is_deprecated */
  deprecated: boolean;
}

export const COLUMNS: Record<keyof LLMEvaluator, string> = {
  id: "id",
  name: "name",
  outputFormatType: "output_format_type",
  type: "type",
  userId: "user_id",
  description: "description",
  variables: "variables",
  outputCategories: "output_categories",
  modelId: "model_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  deprecated: "is_deprecated",
};

export function create(init: Partial<LLMEvaluator> = {}): LLMEvaluator {
  return {
    id: null,
    name: null,
    outputFormatType: null,
    type: null,
    userId: null,
    description: null,
    variables: null,
    outputCategories: null,
    modelId: null,
    createdAt: null,
    updatedAt: null,
    deprecated: false,
    ...init,
  };
}

export function prePersist(e: LLMEvaluator): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

function jsonText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function fromRow(row: Row): LLMEvaluator {
  return {
    id: str(row.id),
    name: str(row.name),
    outputFormatType: ScoreTypeConverter.convertToEntityAttribute(row.output_format_type),
    type: ScopeTypeConverter.convertToEntityAttribute(row.type),
    userId: str(row.user_id),
    description: str(row.description),
    variables: jsonText(row.variables),
    outputCategories: jsonText(row.output_categories),
    modelId: str(row.model_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    deprecated: toBool(row.is_deprecated) ?? false,
  };
}

export function toRow(e: LLMEvaluator): Record<string, Param> {
  return {
    id: e.id,
    name: e.name,
    output_format_type: ScoreTypeConverter.convertToDatabaseColumn(e.outputFormatType),
    type: ScopeTypeConverter.convertToDatabaseColumn(e.type),
    user_id: e.userId,
    description: e.description,
    variables: e.variables,
    output_categories: e.outputCategories,
    model_id: e.modelId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    is_deprecated: bool(e.deprecated ?? false),
  };
}

/** Scalar fields; callers add `inputs`, `user`, `model`. */
export function toJson(e: LLMEvaluator): Record<string, unknown> {
  const { userId: _u, modelId: _m, ...rest } = e;
  return rest;
}
