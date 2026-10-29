/** Port of domain/tags/repository/ChatTurnFetcher (@TaggableEntityFetcher(CHAT_TURN)). */
import type { Ctx } from "../../../lib/ctx";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import { type ChatTurnDTO, fromChatTurns } from "../../chatturn/dto/ChatTurnDTO";

export async function findAllByIds(ctx: Ctx, ids: string[], user: { id: string | null }): Promise<ChatTurnDTO[]> {
  return fromChatTurns(ctx.db, await ChatTurnRepository.findChatTurnsByList(ctx.db, ids, user.id as string));
}
