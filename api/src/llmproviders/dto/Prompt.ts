import type { InputRole } from "../../enums/InputRole";

/** Port of llmproviders/dto/Prompt. JSON: `{ "role": "USER", "text": "..." }`. */
export interface Prompt {
  role: InputRole | null;
  text: string | null;
}

/** `new Prompt(ModelInput)`. */
export function fromModelInput(input: { role: InputRole | null; text: string | null }): Prompt {
  return { role: input.role, text: input.text };
}

/** `new Prompt(ModelResponse)`: always an ASSISTANT prompt. */
export function fromModelResponse(response: { text: string | null }): Prompt {
  return { role: "ASSISTANT", text: response.text };
}
