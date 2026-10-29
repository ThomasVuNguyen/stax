/** Port of domain/model/dto/ModelTokens (JSON names). */
export interface ModelTokens {
  input_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens: number | null;
  total_tokens: number | null;
}

/** Java `new ModelTokens(turnPromptTokens, turnCompletionTokens, turnTotalTokens)`. */
export function create(
  turnPromptTokens: number | null,
  turnCompletionTokens: number | null,
  turnTotalTokens: number | null,
): ModelTokens {
  return {
    input_tokens: turnPromptTokens,
    output_tokens: turnCompletionTokens,
    total_tokens: turnTotalTokens,
    // Java unboxed the Integers (NullPointerException on null); here nulls count as 0.
    thinking_tokens: (turnTotalTokens ?? 0) - ((turnPromptTokens ?? 0) + (turnCompletionTokens ?? 0)),
  };
}
