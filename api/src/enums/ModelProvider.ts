export const ModelProvider = {
  OPENAI: "OPENAI",
  MISTRAL: "MISTRAL",
  GOOGLE: "GOOGLE",
  ANTHROPIC: "ANTHROPIC",
  GROK: "GROK",
  DEEPSEEK: "DEEPSEEK",
  LLAMA: "LLAMA",
} as const;
export type ModelProvider = (typeof ModelProvider)[keyof typeof ModelProvider];

/** Declaration order (`ModelProvider.values()`). */
export const ModelProviderValues: ModelProvider[] = [ModelProvider.OPENAI, ModelProvider.MISTRAL, ModelProvider.GOOGLE, ModelProvider.ANTHROPIC, ModelProvider.GROK, ModelProvider.DEEPSEEK, ModelProvider.LLAMA];

export const ModelProviderValue: Record<ModelProvider, string> = {
  OPENAI: "OpenAI",
  MISTRAL: "Mistral",
  GOOGLE: "Google",
  ANTHROPIC: "Anthropic",
  GROK: "Grok",
  DEEPSEEK: "DeepSeek",
  LLAMA: "Llama",
};

export function getValue(e: ModelProvider): string {
  return ModelProviderValue[e];
}
