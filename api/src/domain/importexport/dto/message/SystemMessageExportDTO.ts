import type { BaseMessageExportDTO } from "./BaseMessageExportDTO";

/** Port of SystemMessageExportDTO (no @JsonInclude: nulls are written). */
export interface SystemMessageExportDTO extends BaseMessageExportDTO {
  role: "system";
  content: string | null;
  variables: Record<string, string> | null;
}

export function create(content: string | null, variables: Record<string, string> | null): SystemMessageExportDTO {
  return { role: "system", content, variables };
}
