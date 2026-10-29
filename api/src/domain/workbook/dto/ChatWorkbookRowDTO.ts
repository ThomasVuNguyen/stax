/**
 * Port of domain/workbook/dto/ChatWorkbookRowDTO (Taggable: CHAT, id = chat_id): the row of the
 * chat's latest turn, with the latency averaged and the tokens summed over all turns of the chat.
 *
 * `new ChatWorkbookRowDTO(chat)` → `fromLatestTurns(db, latestTurns)`: one row per given latest
 * turn (the turn objects are used as Chat#getLatestTurn(), so their transient
 * `effectiveSystemInstruction` is kept). Tags are not set here (see GetWorkbookResponseDTO).
 */
import { allIn } from "../../../lib/db";
import type { ChatTurn } from "../../../entities/ChatTurn";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import { type BaseWorkbookRowDTO, buildBaseRow, loadChatTurns, modelTokens } from "./BaseWorkbookRowDTO";

export type ChatWorkbookRowDTO = BaseWorkbookRowDTO;

interface TurnMonitoringRow {
  chat_id: string;
  has_im: number;
  turn_time_taken: number | null;
  turn_prompt_tokens: number | null;
  turn_completion_tokens: number | null;
  turn_total_tokens: number | null;
}

/** Inference monitoring of every turn (that has one) of the given chats, grouped by chat id. */
async function monitoringByChat(db: D1Database, chatIds: string[]): Promise<Map<string, TurnMonitoringRow[]>> {
  const rows = await allIn<TurnMonitoringRow>(
    db,
    (inn) => `SELECT ct.chat_id AS chat_id, (im.id IS NOT NULL) AS has_im, im.turn_time_taken, im.turn_prompt_tokens,
        im.turn_completion_tokens, im.turn_total_tokens
      FROM chat_turns ct
      LEFT JOIN model_response mr ON mr.id = ct.model_response_id
      LEFT JOIN inference_monitoring im ON im.id = mr.inference_monitoring_id
      WHERE ct.chat_id IN ${inn}`,
    chatIds,
  );
  const out = new Map<string, TurnMonitoringRow[]>();
  for (const r of rows) {
    if (!r.has_im) continue;
    const list = out.get(r.chat_id) ?? [];
    list.push(r);
    out.set(r.chat_id, list);
  }
  return out;
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

export async function fromLatestTurns(db: D1Database, latestTurns: ChatTurn[]): Promise<ChatWorkbookRowDTO[]> {
  const loaded = await loadChatTurns(db, latestTurns);
  const chatIds = [...new Set(latestTurns.map((t) => t.chatId).filter((x): x is string => !!x))];
  const monitoring = await monitoringByChat(db, chatIds);
  return loaded.map((turn) => {
    const row = buildBaseRow(turn, (r) => r.chat_id, TagLinkTargetType.CHAT);
    // The chat has at least this turn, so Java always overrode latency and tokens here.
    const ims = monitoring.get(turn.chatId as string) ?? [];
    const latencies = ims.map((m) => m.turn_time_taken).filter((x): x is number => x != null);
    const avg = latencies.length ? latencies.reduce((a, x) => a + x, 0) / latencies.length : 0.0;
    row.inference_latency = Math.round(avg * 100.0) / 100.0;
    row.inference_tokens = modelTokens(
      sum(ims.map((m) => m.turn_prompt_tokens)),
      sum(ims.map((m) => m.turn_completion_tokens)),
      sum(ims.map((m) => m.turn_total_tokens)),
    );
    return row;
  });
}
