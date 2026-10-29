import type { CopyChatsRequestDTO } from "./CopyChatsRequestDTO";

/** Port of domain/datatransfer/dto/CopySelectedChatsRequestDTO (@NotEmpty @Size(1..100) chat_ids). */
export interface CopySelectedChatsRequestDTO extends CopyChatsRequestDTO {
  chat_ids?: string[] | null;
}
