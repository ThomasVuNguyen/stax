/**
 * Port of domain/evaluator/pairwise/dto/PairwiseLLMEvaluatorResponseDTO (@JsonInclude NON_NULL;
 * no `evaluation_type` / `deprecated`, unlike LLMEvaluatorResponseDTO).
 */
import type { Model } from "../../../../entities/Model";
import type { ModelInput } from "../../../../entities/ModelInput";
import type { PairwiseLLMEvaluator } from "../../../../entities/PairwiseLLMEvaluator";
import type { ScopeType } from "../../../../enums/ScopeType";
import type { ScoreType } from "../../../../enums/ScoreType";
import { convertJsonStringToList } from "../../../../util/ObjectMapperUtil";
import * as EvaluatorVariableDTO from "../../dto/EvaluatorVariableDTO";
import * as OutputCategoryDTO from "../../dto/OutputCategoryDTO";
import { modelDTOJson, modelInputDTOJson } from "../../llm/dto/LLMEvaluatorResponseDTO";

export interface PairwiseLLMEvaluatorResponseDTO {
  id?: string;
  name?: string;
  type?: ScopeType;
  output_format_type?: ScoreType;
  description?: string;
  variables?: (EvaluatorVariableDTO.EvaluatorVariableDTO | null)[];
  output_categories?: (OutputCategoryDTO.OutputCategoryDTO | null)[];
  model?: Record<string, unknown>;
  prompts?: Record<string, unknown>[];
  created_at?: string;
  updated_at?: string;
}

/** `new PairwiseLLMEvaluatorResponseDTO(evaluator)` with its loaded model and inputs. */
export function fromPairwiseLLMEvaluator(
  e: PairwiseLLMEvaluator,
  model: Model | null,
  inputs: ModelInput[] | null,
): PairwiseLLMEvaluatorResponseDTO {
  const out: Record<string, unknown> = {
    id: e.id,
    name: e.name,
    type: e.type,
    output_format_type: e.outputFormatType,
    description: e.description,
    variables: e.variables != null ? EvaluatorVariableDTO.normalizeList(convertJsonStringToList(e.variables)) : null,
    output_categories:
      e.outputCategories != null ? OutputCategoryDTO.normalizeList(convertJsonStringToList(e.outputCategories)) : null,
    model: model ? modelDTOJson(model) : null,
    prompts: inputs ? inputs.map(modelInputDTOJson) : null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out as PairwiseLLMEvaluatorResponseDTO;
}
