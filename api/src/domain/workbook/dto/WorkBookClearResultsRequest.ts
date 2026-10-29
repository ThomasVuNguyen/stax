/** Port of domain/workbook/dto/WorkBookClearResultsRequest. */
import { InvalidDataException } from "../../../lib/errors";

export interface WorkBookClearResultsRequest {
  chat_turn_ids: string[] | null;
}

/** @NotEmpty chatTurnIds (MethodArgumentNotValidException format). */
export function validate(r: WorkBookClearResultsRequest): void {
  if (!Array.isArray(r.chat_turn_ids) || r.chat_turn_ids.length === 0) {
    throw new InvalidDataException("chatTurnIds: At least one chat turn id is required");
  }
}
