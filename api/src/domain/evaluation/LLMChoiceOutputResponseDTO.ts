/**
 * Port of domain/evaluation/LLMChoiceOutputResponseDTO: parses an evaluator reply
 * ("<category>\n<reasoning>") against the evaluator's output categories.
 * - no category line → score "NaN"
 * - category not among the output categories (case-insensitive) → score null
 */
import { RuntimeException } from "../../lib/errors";
import { CATEGORY_PATTERN } from "../../util/EvaluationPatternUtil";
import { convertJsonStringToList } from "../../util/ObjectMapperUtil";
import type { OutputCategoryDTO } from "../evaluator/dto/OutputCategoryDTO";

export interface LLMChoiceOutputResponseDTO {
  outputCategories: OutputCategoryDTO[];
  llmResponse: string | null;
  category: string | null;
  reasoning: string | null;
  score: string | null;
}

/** `new LLMChoiceOutputResponseDTO(llmResponse, outputCategoriesRaw)`. */
export function create(llmResponse: string | null, outputCategoriesRaw: string | null): LLMChoiceOutputResponseDTO {
  let outputCategories: OutputCategoryDTO[];
  try {
    outputCategories = convertJsonStringToList<OutputCategoryDTO>(outputCategoriesRaw) ?? [];
  } catch (e) {
    console.error(`Error parsing output categories: ${(e as Error).message}`);
    outputCategories = [];
  }
  const dto: LLMChoiceOutputResponseDTO = { outputCategories, llmResponse, category: null, reasoning: null, score: null };
  if (llmResponse == null) {
    // Pattern.matcher(null) threw a NullPointerException in Java.
    throw new RuntimeException('Cannot invoke "java.lang.CharSequence.length()" because "this.text" is null');
  }
  const m = CATEGORY_PATTERN.exec(llmResponse);
  if (m) {
    dto.category = m[1];
    dto.reasoning = m[2].trim();
    const match = outputCategories.find((c) => c?.name != null && c.name.toLowerCase() === m[1].toLowerCase());
    if (match) dto.score = match.value ?? null;
  } else {
    console.warn(`No category found in LLM response: ${llmResponse}`);
    dto.score = "NaN";
  }
  return dto;
}
