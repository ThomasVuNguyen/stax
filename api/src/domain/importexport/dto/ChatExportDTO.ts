import type { LLMEvaluationDTO } from "../../evaluation/dto/LLMEvaluationDTO";
import type { InferenceAnalyticsDTO } from "./InferenceAnalyticsDTO";
import { type MessageExportDTO, nonEmpty } from "./message/BaseMessageExportDTO";

/**
 * Port of domain/importexport/dto/ChatExportDTO (@JsonInclude NON_EMPTY, properties in `index`
 * order). The primitive ints `turns` and `human_evaluation` are always written.
 */
export interface ChatExportDTO {
  system_instruction?: string | null;
  input?: string | null;
  tags?: string | null;
  turns: number;
  expected_output?: string | null;
  model_nickname?: string | null;
  human_evaluation: number;
  human_evaluation_notes?: string | null;
  output?: string | null;
  inference_analytics?: InferenceAnalyticsDTO | null;
  llm_evaluations?: Record<string, LLMEvaluationDTO> | null;
  variables?: Record<string, string> | null;
  chat?: MessageExportDTO[] | null;
}

/** Builds the JSON in Jackson's property order, applying NON_EMPTY. */
export function toJson(d: ChatExportDTO): ChatExportDTO {
  return nonEmpty({
    system_instruction: d.system_instruction,
    input: d.input,
    tags: d.tags,
    turns: d.turns,
    expected_output: d.expected_output,
    model_nickname: d.model_nickname,
    human_evaluation: d.human_evaluation,
    human_evaluation_notes: d.human_evaluation_notes,
    output: d.output,
    inference_analytics: d.inference_analytics,
    llm_evaluations: d.llm_evaluations,
    variables: d.variables,
    chat: d.chat,
  });
}
