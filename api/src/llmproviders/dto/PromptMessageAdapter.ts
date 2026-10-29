import { RuntimeException, UnsupportedOperationException } from "../../lib/errors";
import type { Prompt } from "./Prompt";

/**
 * Port of llmproviders/dto/PromptMessageAdapter. langchain4j's ChatMessage becomes a small
 * provider-neutral message; each strategy serialises it for its HTTP API.
 */
export interface ChatMessage {
  type: "USER" | "AI" | "SYSTEM";
  text: string;
}

export function toLangChain4jMessage(prompt: Prompt): ChatMessage {
  switch (prompt.role) {
    case "USER":
      return { type: "USER", text: prompt.text as string };
    case "ASSISTANT":
      return { type: "AI", text: prompt.text as string };
    case "SYSTEM":
      return { type: "SYSTEM", text: prompt.text as string };
    default:
      throw new UnsupportedOperationException(`Unsupported role: ${prompt.role}`);
  }
}

/** Drops prompts with empty text (a null text threw a NullPointerException in Java). */
export function toLangChain4jMessages(prompts: Prompt[]): ChatMessage[] {
  return prompts
    .filter((p) => {
      if (p.text === null || p.text === undefined) {
        throw new RuntimeException('Cannot invoke "String.isEmpty()" because the return value of "Prompt.getText()" is null');
      }
      return p.text.length > 0;
    })
    .map(toLangChain4jMessage);
}
