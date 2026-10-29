import type { LLMEvaluationDTO } from "../../../evaluation/dto/LLMEvaluationDTO";
import type { ModelTokens } from "../../../model/dto/ModelTokens";
import { type BaseMessageExportDTO, nonEmpty } from "./BaseMessageExportDTO";

/**
 * Port of AssistantMessageExportDTO (@JsonInclude NON_EMPTY). `human_evaluation` is a primitive
 * int, so it is always written (NON_EMPTY does not drop 0 for primitives).
 */
export interface AssistantMessageExportDTO extends BaseMessageExportDTO {
  role: "assistant";
  model_nickname?: string | null;
  tags?: string | null;
  inference_latency?: number | null;
  inference_tokens?: ModelTokens | null;
  human_evaluation: number;
  human_evaluation_notes?: string | null;
  llm_evaluations?: Record<string, LLMEvaluationDTO> | null;
}

export function create(fields: Omit<AssistantMessageExportDTO, "role">): AssistantMessageExportDTO {
  return nonEmpty({
    role: "assistant" as const,
    content: fields.content,
    model_nickname: fields.model_nickname,
    tags: fields.tags,
    inference_latency: fields.inference_latency,
    inference_tokens: fields.inference_tokens,
    human_evaluation: fields.human_evaluation,
    human_evaluation_notes: fields.human_evaluation_notes,
    llm_evaluations: fields.llm_evaluations,
  });
}
