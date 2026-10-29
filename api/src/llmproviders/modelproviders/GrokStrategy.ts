import { OpenAiCommonStrategy, type OpenAiChatOptions } from "./OpenAiCommonStrategy";

/** Port of GrokStrategy (bean "grok"): OpenAI-compatible chat completions at model.url. */
export class GrokStrategy extends OpenAiCommonStrategy {
  protected buildClientWithOptions(): OpenAiChatOptions {
    return this.applyExtendedOptions(this.getBuilderWithCommonOptions());
  }

  protected buildStreamingClientWithOptions(): OpenAiChatOptions {
    return this.applyExtendedOptions(this.getStreamingBuilderWithCommonOptions());
  }
}
