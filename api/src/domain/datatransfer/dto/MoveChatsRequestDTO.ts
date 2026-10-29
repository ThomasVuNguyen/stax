import type { MoveAllChatsRequestDTO } from "./MoveAllChatsRequestDTO";

/** Port of domain/datatransfer/dto/MoveChatsRequestDTO (@NotEmpty @Size(1..100) chat_ids). */
export interface MoveChatsRequestDTO extends MoveAllChatsRequestDTO {
  chat_ids?: string[] | null;
}
