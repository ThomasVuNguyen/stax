/**
 * Port of domain/project/dto/SXSChatTurnWorkbookRowDTO (Taggable: CHAT_TURN, id = chat_turn_id).
 * Same fields as the workbook row minus thinking_output / pointwise_heuristic_evaluations;
 * `llm_evaluations` is declared but never set (always null).
 * `new SXSChatTurnWorkbookRowDTO(chatTurn)` → `build(loadedTurn)` (see BaseWorkbookRowDTO for
 * loading the turn graph).
 */
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import { type BaseWorkbookRowDTO, type LoadedChatTurn, buildBaseRow } from "../../workbook/dto/BaseWorkbookRowDTO";

export type SXSChatTurnWorkbookRowDTO = Omit<BaseWorkbookRowDTO, "thinking_output" | "pointwise_heuristic_evaluations">;

export function build(turn: LoadedChatTurn | null): SXSChatTurnWorkbookRowDTO {
  const { thinking_output: _t, pointwise_heuristic_evaluations: _p, ...row } = buildBaseRow(
    turn,
    (r) => r.chat_turn_id,
    TagLinkTargetType.CHAT_TURN,
  );
  row.llm_evaluations = null;
  return row;
}
