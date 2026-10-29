import type { ChatTurnContainerType } from "../../../enums/ChatTurnContainerType";
import type { ImportRequest } from "./ImportRequest";

/** Port of the ChatImportRequest record (components keep their Java names; not a JSON DTO). */
export interface ChatImportRequest extends ImportRequest {
  sourceType: ChatTurnContainerType;
  sourceId: string;
  chatColumnName: string | null;
  metadataColumnNames: string[] | null;
  inputColumnName: string | null;
  outputColumnName: string | null;
  expectedOutputColumnName: string | null;
  tagsColumnName: string | null;
  systemInstructionColumnName: string | null;
  modelLabelColumnName: string | null;
  humanEvalScoreColumnName: string | null;
  humanEvalNotesColumnName: string | null;
  inferenceAnalyticsColumnName: string | null;
  llmEvaluationsColumnName: string | null;
}
