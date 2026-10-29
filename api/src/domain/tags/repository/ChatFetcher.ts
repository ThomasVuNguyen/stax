/**
 * Port of domain/tags/repository/ChatFetcher (@TaggableEntityFetcher(CHAT)). Maps chats with
 * `new ChatDTO(Chat)`, which fails for chats that have turns (see ChatDTO.newChatDTOFromChat).
 */
import type { Ctx } from "../../../lib/ctx";
import * as ChatRepository from "../../chat/ChatRepository";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import { type ChatDTO, newChatDTOFromChat } from "../../chat/dto/ChatDTO";

export async function findAllByIds(ctx: Ctx, ids: string[], user: { id: string | null }): Promise<ChatDTO[]> {
  const chats = await ChatRepository.findByUserAndIdIn(ctx.db, user.id as string, ids);
  const turns = await ChatTurnRepository.findByChatIn(ctx.db, chats.map((c) => c.id as string));
  return chats.map((chat) => newChatDTOFromChat(chat, turns.filter((t) => t.chatId === chat.id)));
}
