import type { ImportRequest } from "./ImportRequest";

/** Port of the SxsImportRequest record (components keep their Java names; not a JSON DTO). */
export interface SxsImportRequest extends ImportRequest {
  projectId: string;
  chatAColumnName: string | null;
  chatBColumnName: string | null;
  inputColumnName: string | null;
  systemInstructionAColumnName: string | null;
  systemInstructionBColumnName: string | null;
  outputAColumnName: string | null;
  outputBColumnName: string | null;
  modelLabelAColumnName: string | null;
  modelLabelBColumnName: string | null;
  tagsColumnName: string | null;
  llmEvaluationsAColumnName: string | null;
  llmEvaluationsBColumnName: string | null;
  inferenceAnalyticsAColumnName: string | null;
  inferenceAnalyticsBColumnName: string | null;
  variablesColumnName: string | null;
  ratingColumnName: string | null;
  notesColumnName: string | null;
  expectedOutputColumnName: string | null;
}
