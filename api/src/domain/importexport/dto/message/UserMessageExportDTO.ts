import { type BaseMessageExportDTO, nonEmpty } from "./BaseMessageExportDTO";

/** Port of UserMessageExportDTO (@JsonInclude NON_EMPTY). */
export interface UserMessageExportDTO extends BaseMessageExportDTO {
  role: "user";
  expected_output?: string | null;
  variables?: Record<string, string> | null;
}

export function create(
  content: string | null,
  expectedOutput: string | null,
  variables: Record<string, string> | null,
): UserMessageExportDTO {
  return nonEmpty({ role: "user" as const, content, expected_output: expectedOutput, variables });
}
