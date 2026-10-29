import { OpenAiCommonStrategy, type OpenAiChatOptions } from "./OpenAiCommonStrategy";

/** Port of HuggingFaceStrategy (bean "huggingface"): OpenAI-compatible chat completions at model.url. */
export class HuggingFaceStrategy extends OpenAiCommonStrategy {
  protected buildClientWithOptions(): OpenAiChatOptions {
    return this.applyExtendedOptions(this.getBuilderWithCommonOptions());
  }

  protected buildStreamingClientWithOptions(): OpenAiChatOptions {
    return this.applyExtendedOptions(this.getStreamingBuilderWithCommonOptions());
  }
}
