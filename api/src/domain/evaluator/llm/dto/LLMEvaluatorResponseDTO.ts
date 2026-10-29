/**
 * Port of domain/evaluator/llm/dto/LLMEvaluatorResponseDTO (@JsonInclude NON_NULL).
 * The two Java constructors become `fromLLMEvaluator` / `fromPairwiseLLMEvaluator`; the relations
 * the Java entity graph provided (model, inputs) are passed in.
 *
 * `modelDTOJson` / `modelInputDTOJson` reproduce `new ModelDTO(model)` and
 * `new ModelInputDTO(input)` (owned by domain/model and domain/modelinput) for the nested JSON.
 */
import type { LLMEvaluator } from "../../../../entities/LLMEvaluator";
import type { Model } from "../../../../entities/Model";
import { isCustomEndpoint } from "../../../../entities/Model";
import type { ModelInput } from "../../../../entities/ModelInput";
import type { PairwiseLLMEvaluator } from "../../../../entities/PairwiseLLMEvaluator";
import { EvaluationType } from "../../../../enums/EvaluationType";
import type { ScopeType } from "../../../../enums/ScopeType";
import type { ScoreType } from "../../../../enums/ScoreType";
import { convertJsonStringToList, convertJsonStringToMap } from "../../../../util/ObjectMapperUtil";
import { ADDITIONAL_HEADERS, API_KEY_PROPERTY_NAME } from "../../../../util/PlanckConstants";
import { enrichTextForResponse } from "../../../../util/PromptUtil";
import * as EvaluatorVariableDTO from "../../dto/EvaluatorVariableDTO";
import * as OutputCategoryDTO from "../../dto/OutputCategoryDTO";

export interface LLMEvaluatorResponseDTO {
  id?: string;
  name?: string;
  evaluation_type?: EvaluationType;
  type?: ScopeType;
  output_format_type?: ScoreType;
  description?: string;
  variables?: (EvaluatorVariableDTO.EvaluatorVariableDTO | null)[];
  output_categories?: (OutputCategoryDTO.OutputCategoryDTO | null)[];
  model?: Record<string, unknown>;
  prompts?: Record<string, unknown>[];
  created_at?: string;
  updated_at?: string;
  deprecated: boolean;
}

/** JSON of `new ModelDTO(model)` (no @JsonInclude: every property is written). */
export function modelDTOJson(model: Model): Record<string, unknown> {
  const custom = isCustomEndpoint(model);
  const properties = convertJsonStringToMap(model.properties);
  let apiKey: unknown = null;
  let additionalHeaders: unknown = null;
  if (custom && properties != null) {
    if (API_KEY_PROPERTY_NAME in properties) apiKey = properties[API_KEY_PROPERTY_NAME];
    if (ADDITIONAL_HEADERS in properties) additionalHeaders = properties[ADDITIONAL_HEADERS];
  }
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    label: model.label,
    nickname: model.label,
    url: model.url,
    tag: null,
    description: null,
    comments: model.comments,
    properties,
    pricing: null,
    descriptors: convertJsonStringToMap(model.descriptors),
    // ModelDTO(Model) never fills the key set; custom endpoints always report true.
    is_api_key_present: custom,
    is_deprecated: model.isDeprecated,
    model_type: model.type,
    release_date: model.releaseDate,
    is_custom_endpoint: custom,
    api_key: apiKey,
    additional_headers: additionalHeaders,
  };
}

/** JSON of `new ModelInputDTO(input)` (snake_case, NON_NULL). */
export function modelInputDTOJson(input: ModelInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: input.id,
    parent_input_id: input.modelInputId,
    text: enrichTextForResponse(input.text, input.variables),
    raw_text: input.text,
    role: input.role,
    expected_output: input.expectedOutput,
    variables: input.variables,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  };
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out;
}

function nonNull<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] == null) delete o[k];
  return o;
}

function build(
  e: LLMEvaluator | PairwiseLLMEvaluator,
  evaluationType: EvaluationType,
  model: Model | null,
  inputs: ModelInput[],
): LLMEvaluatorResponseDTO {
  return nonNull({
    id: e.id,
    name: e.name,
    evaluation_type: evaluationType,
    type: e.type,
    output_format_type: e.outputFormatType,
    description: e.description,
    variables: EvaluatorVariableDTO.normalizeList(convertJsonStringToList(e.variables)),
    output_categories: OutputCategoryDTO.normalizeList(convertJsonStringToList(e.outputCategories)),
    model: model ? modelDTOJson(model) : null,
    prompts: inputs.map(modelInputDTOJson),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deprecated: !!e.deprecated,
  } as Record<string, unknown>) as unknown as LLMEvaluatorResponseDTO;
}

/** `new LLMEvaluatorResponseDTO(LLMEvaluator)`: evaluation_type POINTWISE. */
export function fromLLMEvaluator(e: LLMEvaluator, model: Model | null, inputs: ModelInput[]): LLMEvaluatorResponseDTO {
  return build(e, EvaluationType.POINTWISE, model, inputs);
}

/** `new LLMEvaluatorResponseDTO(PairwiseLLMEvaluator)`: evaluation_type SXS. */
export function fromPairwiseLLMEvaluator(
  e: PairwiseLLMEvaluator,
  model: Model | null,
  inputs: ModelInput[],
): LLMEvaluatorResponseDTO {
  return build(e, EvaluationType.SXS, model, inputs);
}
