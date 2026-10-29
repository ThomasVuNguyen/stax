/**
 * Port of domain/chat/dto/ChatDTO (Taggable CHAT; nulls are serialised).
 *
 * - `newChatDTO(turns)` is `new ChatDTO(List<ChatTurn>)` (turns loaded with
 *   chatturn/LoadedChatTurn); `fromChatTurns(db, turns)` loads and converts.
 * - `newChatDTOFromChat(chat, turns)` is `new ChatDTO(Chat)`. In Java that constructor never
 *   initialised `chatTurns`, so it threw a NullPointerException for any chat with turns; that is
 *   reproduced (callers relied on it failing, see tags/repository/ChatFetcher).
 */
import type { Chat } from "../../../entities/Chat";
import type { ChatTurn } from "../../../entities/ChatTurn";
import { RuntimeException } from "../../../lib/errors";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import { type ChatTurnDTO, newChatTurnDTO } from "../../chatturn/dto/ChatTurnDTO";
import { type LoadedChatTurn, loadChatTurns } from "../../chatturn/LoadedChatTurn";
import type { TagDTO } from "../../tags/dto/TagDTO";
import { markTaggable } from "../../tags/dto/Taggable";

export interface ChatDTO {
  chat_id: string | null;
  chat_turns: ChatTurnDTO[] | null;
  tags: TagDTO[] | null;
  variables: Record<string, string> | null;
  /** Taggable#getTagLinkTargetType(), serialised by Jackson. */
  tagLinkTargetType?: TagLinkTargetType;
}

/** `new ChatDTO(List<ChatTurn>)`: id and variables come from the first turn's chat. */
export function newChatDTO(turns: LoadedChatTurn[]): ChatDTO {
  const chat = turns[0]?.chat ?? null;
  const dto: ChatDTO = {
    chat_id: turns.length ? (chat?.id ?? turns[0].chatId) : null,
    chat_turns: turns.map(newChatTurnDTO),
    tags: null,
    variables: turns.length ? (chat?.variables ?? null) : null,
  };
  return markTaggable(dto, TagLinkTargetType.CHAT, dto.chat_id);
}

export async function fromChatTurns(db: D1Database, turns: ChatTurn[]): Promise<ChatDTO> {
  return newChatDTO(await loadChatTurns(db, turns));
}

/** `new ChatDTO(Chat)` (see header). */
export function newChatDTOFromChat(chat: Chat, turns: readonly unknown[]): ChatDTO {
  if (turns.length) {
    throw new RuntimeException('Cannot invoke "java.util.List.add(Object)" because "this.chatTurns" is null');
  }
  return markTaggable(
    { chat_id: chat.id, chat_turns: null, tags: null, variables: chat.variables },
    TagLinkTargetType.CHAT,
    chat.id,
  );
}
