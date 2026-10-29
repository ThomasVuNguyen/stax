/**
 * Port of domain/modelresponse/ModelResponseDTO (@JsonInclude(NON_NULL), snake_case).
 * `newModelResponseDTO` takes the response with its loaded relations (model, inferenceMonitoring,
 * humanEvalScores — see chatturn/LoadedChatTurn.loadModelResponse).
 */
import type { LoadedModelResponse } from "../chatturn/LoadedChatTurn";
import {
  type HumanEvalScoreDTO,
  type InferenceMonitoringDTO,
  newHumanEvalScoreDTO,
  newInferenceMonitoringDTO,
} from "../chatturn/dto/ChatTurnDtoSupport";

export interface ModelResponseDTO {
  id?: string;
  text?: string;
  thinking?: string;
  model_id?: string;
  inference_monitoring?: InferenceMonitoringDTO;
  created_at?: string;
  updated_at?: string;
  container_id?: string;
  human_eval_scores?: HumanEvalScoreDTO[];
}

/**
 * `new ModelResponseDTO(modelResponse)`. Java dereferenced `getContainer().getId()`
 * unconditionally (a NullPointerException for responses without a container, e.g. those created
 * by ChatService.createChatTurn); here `container_id` is simply omitted in that case.
 */
export function newModelResponseDTO(mr: LoadedModelResponse): ModelResponseDTO {
  const dto: ModelResponseDTO = {};
  if (mr.id != null) dto.id = mr.id;
  if (mr.text != null) dto.text = mr.text;
  if (mr.thinking != null) dto.thinking = mr.thinking;
  if (mr.model?.id != null) dto.model_id = mr.model.id;
  if (mr.inferenceMonitoring) dto.inference_monitoring = newInferenceMonitoringDTO(mr.inferenceMonitoring);
  if (mr.createdAt != null) dto.created_at = mr.createdAt;
  if (mr.updatedAt != null) dto.updated_at = mr.updatedAt;
  if (mr.containerId != null) dto.container_id = mr.containerId;
  if (mr.humanEvalScores?.length) dto.human_eval_scores = mr.humanEvalScores.map(newHumanEvalScoreDTO);
  return dto;
}
