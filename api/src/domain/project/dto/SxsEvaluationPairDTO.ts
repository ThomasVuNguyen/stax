/** Port of domain/project/dto/SxsEvaluationPairDTO (snake_case JSON). */
import type { SxsEvaluationPair } from "../../../entities/SxsEvaluationPair";
import type { LLMEvaluationDTO } from "../../evaluation/dto/LLMEvaluationDTO";

export interface SxsEvaluationPairDTO {
  id: string | null;
  container_id: string | null;
  chat_id_a: string | null;
  chat_turn_id_a: string | null;
  chat_id_b: string | null;
  chat_turn_id_b: string | null;
  /** Declared but never populated by the Java constructor. */
  llm_evaluations: Record<string, LLMEvaluationDTO> | null;
}

/** `new SxsEvaluationPairDTO(pair)`. */
export function from(pair: SxsEvaluationPair): SxsEvaluationPairDTO {
  return {
    id: pair.id,
    container_id: pair.containerId,
    chat_id_a: pair.chatAId,
    chat_turn_id_a: pair.chatTurnAId,
    chat_id_b: pair.chatBId,
    chat_turn_id_b: pair.chatTurnBId,
    llm_evaluations: null,
  };
}
