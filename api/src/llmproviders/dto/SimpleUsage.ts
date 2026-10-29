/** Port of llmproviders/dto/SimpleUsage. */
export interface SimpleUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function newSimpleUsage(promptTokens: number, completionTokens: number, totalTokens: number): SimpleUsage {
  return { promptTokens, completionTokens, totalTokens };
}
