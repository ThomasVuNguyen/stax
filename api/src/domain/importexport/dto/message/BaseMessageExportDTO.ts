import type { AssistantMessageExportDTO } from "./AssistantMessageExportDTO";
import type { SystemMessageExportDTO } from "./SystemMessageExportDTO";
import type { UserMessageExportDTO } from "./UserMessageExportDTO";

/**
 * Port of domain/importexport/dto/message/BaseMessageExportDTO: polymorphic on the `role` property
 * (@JsonTypeInfo NAME → "user" | "assistant" | "system"), which Jackson wrote first.
 * Reading these messages back (chat import) is done by util/ChatCreationHelper.
 */
export interface BaseMessageExportDTO {
  role: "user" | "assistant" | "system";
  content?: string | null;
}

export type MessageExportDTO = UserMessageExportDTO | AssistantMessageExportDTO | SystemMessageExportDTO;

/** JsonInclude.NON_EMPTY: drops null/undefined, "" and empty arrays/objects. */
export function nonEmpty<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out[k] = v;
  }
  return out as T;
}
