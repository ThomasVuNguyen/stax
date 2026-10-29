import type { ChatTurnContainerType } from "../../../enums/ChatTurnContainerType";

/** Port of domain/datatransfer/dto/CopyChatsRequestDTO (@JsonProperty snake_case names). */
export interface CopyChatsRequestDTO {
  source_id?: string | null;
  source_type?: ChatTurnContainerType | null;
  target_id?: string | null;
  target_type?: ChatTurnContainerType | null;
}
