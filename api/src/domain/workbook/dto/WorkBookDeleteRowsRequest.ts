/** Port of domain/workbook/dto/WorkBookDeleteRowsRequest. */
import { InvalidDataException } from "../../../lib/errors";

export interface WorkBookDeleteRowsRequest {
  chat_ids: string[] | null;
}

/** @NotEmpty chatIds (MethodArgumentNotValidException format). */
export function validate(r: WorkBookDeleteRowsRequest): void {
  if (!Array.isArray(r.chat_ids) || r.chat_ids.length === 0) {
    throw new InvalidDataException("chatIds: At least one chat id is required");
  }
}
