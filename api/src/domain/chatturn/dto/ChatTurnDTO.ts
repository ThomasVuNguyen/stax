/**
 * Port of domain/chatturn/dto/ChatTurnDTO (Taggable CHAT_TURN; nulls are serialised).
 *
 * - `newChatTurnDTO(loadedTurn)` is the Java constructor `new ChatTurnDTO(chatTurn)`; it needs the
 *   turn's relations, loaded with `chatturn/LoadedChatTurn.loadChatTurns`.
 * - `fromChatTurns(db, turns)` / `fromChatTurn(db, turn)` load and convert in one call (what
 *   `turns.stream().map(ChatTurnDTO::new)` did with the EAGER entity graph).
 * - `tags` stays null unless the response goes through TagResponseEnrichmentAdvice.
 */
import type { ChatTurn } from "../../../entities/ChatTurn";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import { type ModelInputDTO, newModelInputDTO } from "../../modelinput/dto/ModelInputDTO";
import { type ModelResponseDTO, newModelResponseDTO } from "../../modelresponse/ModelResponseDTO";
import type { TagDTO } from "../../tags/dto/TagDTO";
import { markTaggable } from "../../tags/dto/Taggable";
import { type LoadedChatTurn, loadChatTurns } from "../LoadedChatTurn";
import {
  type LLMEvaluationDTO,
  type ModelDTO,
  type PointwiseHeuristicEvaluationDTO,
  evaluationScoreMaps,
  getLLMScores,
  getPointwiseHeuristicScores,
  newModelDTO,
  pointwiseHeuristicEvaluationStatuses,
} from "./ChatTurnDtoSupport";

export interface ChatTurnDTO {
  model_inputs: ModelInputDTO[] | null;
  model_output: ModelResponseDTO | null;
  model: ModelDTO | null;
  chat_turn_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  chat_id: string | null;
  sequence_id: number | null;
  evaluation_scores: Record<string, string | null>;
  evaluation_statuses: Record<string, string>;
  inference_status: number | null;
  inference_reason: string | null;
  tags: TagDTO[] | null;
  llm_evaluations: Record<string, LLMEvaluationDTO> | null;
  pointwise_heuristic_evaluations: Record<string, PointwiseHeuristicEvaluationDTO> | null;
  /** Taggable#getTagLinkTargetType(), serialised by Jackson. */
  tagLinkTargetType?: TagLinkTargetType;
}

/** `new ChatTurnDTO(chatTurn)`. */
export function newChatTurnDTO(turn: LoadedChatTurn): ChatTurnDTO {
  const dto: ChatTurnDTO = {
    model_inputs: turn.inputs ? turn.inputs.map(newModelInputDTO) : null,
    model_output: null,
    model: null,
    chat_turn_id: turn.id,
    created_at: turn.createdAt,
    updated_at: turn.updatedAt,
    chat_id: turn.chatId,
    sequence_id: turn.sequenceId,
    evaluation_scores: {},
    evaluation_statuses: {},
    inference_status: null,
    inference_reason: null,
    tags: null,
    llm_evaluations: null,
    pointwise_heuristic_evaluations: null,
  };

  const mr = turn.modelResponse;
  if (mr) {
    dto.model_output = newModelResponseDTO(mr);
    if (mr.model) dto.model = newModelDTO(mr.model);
    if (mr.scores?.length) {
      const maps = evaluationScoreMaps(mr.scores);
      dto.evaluation_scores = maps.scores;
      dto.evaluation_statuses = maps.evaluationStatuses;
      dto.llm_evaluations = getLLMScores(mr.scores);
    }
    if (mr.pointwiseHeuristicEvaluationScores?.length) {
      Object.assign(dto.evaluation_statuses, pointwiseHeuristicEvaluationStatuses(mr.pointwiseHeuristicEvaluationScores));
      dto.pointwise_heuristic_evaluations = getPointwiseHeuristicScores(mr.pointwiseHeuristicEvaluationScores);
    }
  }

  if (turn.inferenceStatus) {
    dto.inference_status = turn.inferenceStatus.status;
    dto.inference_reason = turn.inferenceStatus.reason;
  }
  return markTaggable(dto, TagLinkTargetType.CHAT_TURN, turn.id);
}

/** Loads the relations of `turns` and converts them (same order). */
export async function fromChatTurns(db: D1Database, turns: ChatTurn[]): Promise<ChatTurnDTO[]> {
  return (await loadChatTurns(db, turns)).map(newChatTurnDTO);
}

export async function fromChatTurn(db: D1Database, turn: ChatTurn): Promise<ChatTurnDTO> {
  return (await fromChatTurns(db, [turn]))[0];
}
