import { OpenAiCommonStrategy, type OpenAiChatOptions } from "./OpenAiCommonStrategy";

/** Port of DeepSeekStrategy (bean "deepseek"): OpenAI-compatible chat completions at model.url. */
export class DeepSeekStrategy extends OpenAiCommonStrategy {
  protected buildClientWithOptions(): OpenAiChatOptions {
    return this.applyExtendedOptions(this.getBuilderWithCommonOptions());
  }

  protected buildStreamingClientWithOptions(): OpenAiChatOptions {
    return this.applyExtendedOptions(this.getStreamingBuilderWithCommonOptions());
  }
}
