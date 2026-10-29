import { OpenAiCommonStrategy, type OpenAiChatOptions } from "./OpenAiCommonStrategy";

/** Port of LlamaStrategy (bean "llama"): OpenAI-compatible, common options only. */
export class LlamaStrategy extends OpenAiCommonStrategy {
  protected buildClientWithOptions(): OpenAiChatOptions {
    return this.getBuilderWithCommonOptions();
  }

  protected buildStreamingClientWithOptions(): OpenAiChatOptions {
    return this.getStreamingBuilderWithCommonOptions();
  }
}
