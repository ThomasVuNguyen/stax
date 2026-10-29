import type { RowCreateRequest } from "./RowCreateRequest";

/** Port of domain/dataset/dto/ChatTurnGroupCreateRequest (snake_case, NON_NULL). */
export interface ChatTurnGroupCreateRequest {
  chat_id?: string | null;
  rows?: RowCreateRequest[] | null;
}
