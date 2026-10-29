import type { ChatTurnContainerType } from "../../../enums/ChatTurnContainerType";

/** Port of domain/datatransfer/dto/MoveAllChatsRequestDTO (@JsonProperty snake_case names). */
export interface MoveAllChatsRequestDTO {
  source_id?: string | null;
  source_type?: ChatTurnContainerType | null;
  target_id?: string | null;
  target_type?: ChatTurnContainerType | null;
}
