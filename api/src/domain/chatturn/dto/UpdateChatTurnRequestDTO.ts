/**
 * Port of domain/chatturn/dto/UpdateChatTurnRequestDTO. `@NotEmpty` on expected_output is never
 * enforced: ChatTurnController takes the body without @Valid.
 */
export interface UpdateChatTurnRequestDTO {
  expected_output?: string | null;
}

export function builder(fields: UpdateChatTurnRequestDTO = {}): UpdateChatTurnRequestDTO {
  return { expected_output: fields.expected_output ?? null };
}
