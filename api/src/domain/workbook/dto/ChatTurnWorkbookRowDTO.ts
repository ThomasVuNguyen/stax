/**
 * Port of domain/workbook/dto/ChatTurnWorkbookRowDTO (Taggable: CHAT_TURN, id = chat_turn_id).
 *
 * `new ChatTurnWorkbookRowDTO(chatTurn)` →
 * - `from(ctx, chatTurn[, user])`: loads the turn's entity graph, builds the row and sets its tags (what
 *   TagResponseEnrichmentAdvice did before the response was written; tags are the user's, default
 *   `requireUser(ctx)`);
 * - `fromList(ctx, chatTurns)`: same for a list (one bulk load / tag lookup);
 * - `build(loadedTurn)`: synchronous build from a turn loaded with `loadChatTurns`, without tags.
 */
import type { Ctx } from "../../../lib/ctx";
import { requireUser } from "../../../lib/ctx";
import type { ChatTurn } from "../../../entities/ChatTurn";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import { type BaseWorkbookRowDTO, type LoadedChatTurn, applyTags, buildBaseRow, loadChatTurns } from "./BaseWorkbookRowDTO";

export type ChatTurnWorkbookRowDTO = BaseWorkbookRowDTO;

export function build(turn: LoadedChatTurn | null): ChatTurnWorkbookRowDTO {
  return buildBaseRow(turn, (row) => row.chat_turn_id, TagLinkTargetType.CHAT_TURN);
}

export async function fromList(
  ctx: Ctx,
  chatTurns: ChatTurn[],
  user: { id: string | null } = requireUser(ctx),
): Promise<ChatTurnWorkbookRowDTO[]> {
  const rows = (await loadChatTurns(ctx.db, chatTurns)).map(build);
  await applyTags(ctx, user, rows);
  return rows;
}

export async function from(
  ctx: Ctx,
  chatTurn: ChatTurn,
  user: { id: string | null } = requireUser(ctx),
): Promise<ChatTurnWorkbookRowDTO> {
  return (await fromList(ctx, [chatTurn], user))[0];
}
