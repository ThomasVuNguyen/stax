export const InputRole = {
  USER: "USER",
  ASSISTANT: "ASSISTANT",
  SYSTEM: "SYSTEM",
  DEVELOPER: "DEVELOPER",
  TOOL: "TOOL",
  FUNCTION: "FUNCTION",
} as const;
export type InputRole = (typeof InputRole)[keyof typeof InputRole];

/** Declaration order (`InputRole.values()`). */
export const InputRoleValues: InputRole[] = [InputRole.USER, InputRole.ASSISTANT, InputRole.SYSTEM, InputRole.DEVELOPER, InputRole.TOOL, InputRole.FUNCTION];

/**
 * `ModelInput.role` has no @Enumerated/@Convert, so JPA persists it by ORDINAL
 * (`model_input.role` INTEGER). Index = ordinal.
 */
export const InputRoleOrdinal: InputRole[] = InputRoleValues;

export function inputRoleFromOrdinal(ordinal: unknown): InputRole | null {
  if (ordinal === null || ordinal === undefined) return null;
  return InputRoleOrdinal[Number(ordinal)] ?? null;
}

export function inputRoleToOrdinal(role: InputRole | null | undefined): number | null {
  if (role === null || role === undefined) return null;
  const i = InputRoleOrdinal.indexOf(role);
  return i < 0 ? null : i;
}
