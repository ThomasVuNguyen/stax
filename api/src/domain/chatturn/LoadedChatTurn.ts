/**
 * Not a Java class. In Java a ChatTurn entity carried an EAGER object graph (chat, inputs,
 * modelResponse → model / inferenceMonitoring / scores / humanEvalScores /
 * pointwiseHeuristicEvaluationScores, inferenceStatus) that DTO constructors walked. Entities are
 * flat here, so this module batch-loads that graph once for a list of turns. The relation fields
 * are named after the Java getters, so DTO factories (ChatTurnDTO, workbook rows, exports…) can
 * read `turn.modelResponse.model` exactly like the Java code read `getModelResponse().getModel()`.
 *
 *   const loaded = await loadChatTurns(ctx.db, turns);   // same order as `turns`
 *   const dtos = loaded.map(ChatTurnDTO.newChatTurnDTO);
 */
import { type Row, allIn } from "../../lib/db";
import type { Chat } from "../../entities/Chat";
import * as ChatEntity from "../../entities/Chat";
import type { ChatTurn } from "../../entities/ChatTurn";
import type { EvaluationStatus } from "../../entities/EvaluationStatus";
import * as EvaluationStatusEntity from "../../entities/EvaluationStatus";
import type { HumanEvalScore } from "../../entities/HumanEvalScore";
import type { HumanEvaluator } from "../../entities/HumanEvaluator";
import * as HumanEvaluatorEntity from "../../entities/HumanEvaluator";
import type { InferenceMonitoring } from "../../entities/InferenceMonitoring";
import type { InferenceStatus } from "../../entities/InferenceStatus";
import type { LLMEvaluator } from "../../entities/LLMEvaluator";
import type { Model } from "../../entities/Model";
import type { ModelInput } from "../../entities/ModelInput";
import type { ModelResponse } from "../../entities/ModelResponse";
import type { PointwiseHeuristicEvaluationScore } from "../../entities/PointwiseHeuristicEvaluationScore";
import type { PointwiseHeuristicEvaluator } from "../../entities/PointwiseHeuristicEvaluator";
import * as PointwiseHeuristicEvaluatorEntity from "../../entities/PointwiseHeuristicEvaluator";
import type { ScoreV2 } from "../../entities/ScoreV2";
import * as ChatTurnRepository from "./ChatTurnRepository";
import * as ModelResponseRepository from "../modelresponse/ModelResponseRepository";
import * as ModelRepository from "../model/ModelRepository";
import * as InferenceMonitoringRepository from "../inferencemonitoring/InferenceMonitoringRepository";
import * as InferenceStatusRepository from "../inferencestatus/InferenceStatusRepository";
import * as LLMEvaluatorRepository from "../evaluator/llm/LLMEvaluatorRepository";

export type LoadedScoreV2 = ScoreV2 & {
  llmEvaluator: LLMEvaluator | null;
  evaluationStatus: EvaluationStatus | null;
};

export type LoadedPointwiseHeuristicEvaluationScore = PointwiseHeuristicEvaluationScore & {
  pointwiseEvaluator: PointwiseHeuristicEvaluator | null;
  evaluationStatus: EvaluationStatus | null;
};

export type LoadedHumanEvalScore = HumanEvalScore & { humanEvaluator: HumanEvaluator | null };

export type LoadedModelResponse = ModelResponse & {
  model: Model | null;
  inferenceMonitoring: InferenceMonitoring | null;
  humanEvalScores: LoadedHumanEvalScore[];
  scores: LoadedScoreV2[];
  pointwiseHeuristicEvaluationScores: LoadedPointwiseHeuristicEvaluationScore[];
};

export type LoadedChatTurn = ChatTurn & {
  chat: Chat | null;
  inputs: ModelInput[];
  modelResponse: LoadedModelResponse | null;
  inferenceStatus: InferenceStatus | null;
};

const ids = (xs: (string | null | undefined)[]): string[] => [
  ...new Set(xs.filter((x): x is string => x != null && x !== "")),
];

async function byId<T>(
  db: D1Database,
  table: string,
  keys: string[],
  fromRow: (r: Row) => T,
): Promise<Map<string | null, T>> {
  const rows = await allIn(db, (inn) => `SELECT * FROM "${table}" WHERE id IN ${inn}`, keys);
  return new Map<string | null, T>(rows.map((r) => [String(r.id), fromRow(r)]));
}

/** Loads the full response graph for the given responses (same order). */
export async function loadModelResponses(db: D1Database, responses: ModelResponse[]): Promise<LoadedModelResponse[]> {
  const responseIds = ids(responses.map((r) => r.id));
  const [models, monitorings, humanScores, scores, heuristicScores] = await Promise.all([
    ModelRepository.findAllById(db, ids(responses.map((r) => r.modelId))),
    InferenceMonitoringRepository.findAllById(db, ids(responses.map((r) => r.inferenceMonitoringId))),
    ModelResponseRepository.findHumanEvalScoresByModelResponseIds(db, responseIds),
    ModelResponseRepository.findScoresByModelResponseIds(db, responseIds),
    ModelResponseRepository.findPointwiseHeuristicEvaluationScoresByModelResponseIds(db, responseIds),
  ]);
  const allScores = [...scores.values()].flat();
  const allHeuristic = [...heuristicScores.values()].flat();
  const allHuman = [...humanScores.values()].flat();
  const [llmEvaluators, statuses, heuristicEvaluators, humanEvaluators] = await Promise.all([
    LLMEvaluatorRepository.findAllById(db, ids(allScores.map((s) => s.llmEvaluatorId))),
    byId(
      db,
      EvaluationStatusEntity.TABLE,
      ids([...allScores.map((s) => s.evaluationStatusId), ...allHeuristic.map((s) => s.evaluationStatusId)]),
      EvaluationStatusEntity.fromRow,
    ),
    byId(
      db,
      PointwiseHeuristicEvaluatorEntity.TABLE,
      ids(allHeuristic.map((s) => s.pointwiseEvaluatorId)),
      PointwiseHeuristicEvaluatorEntity.fromRow,
    ),
    byId(db, HumanEvaluatorEntity.TABLE, ids(allHuman.map((s) => s.humanEvaluatorId)), HumanEvaluatorEntity.fromRow),
  ]);
  const modelById = new Map(models.map((m) => [m.id, m]));
  const monitoringById = new Map(monitorings.map((m) => [m.id, m]));
  const llmById = new Map(llmEvaluators.map((e) => [e.id, e]));
  const get = <T>(m: ReadonlyMap<string | null, T>, k: string | null): T | null => (k == null ? null : (m.get(k) ?? null));

  return responses.map((r) => ({
    ...r,
    model: get(modelById, r.modelId),
    inferenceMonitoring: get(monitoringById, r.inferenceMonitoringId),
    humanEvalScores: (humanScores.get(r.id ?? "") ?? []).map((s) => ({
      ...s,
      humanEvaluator: get(humanEvaluators, s.humanEvaluatorId),
    })),
    scores: (scores.get(r.id ?? "") ?? []).map((s) => ({
      ...s,
      llmEvaluator: get(llmById, s.llmEvaluatorId),
      evaluationStatus: get(statuses, s.evaluationStatusId),
    })),
    pointwiseHeuristicEvaluationScores: (heuristicScores.get(r.id ?? "") ?? []).map((s) => ({
      ...s,
      pointwiseEvaluator: get(heuristicEvaluators, s.pointwiseEvaluatorId),
      evaluationStatus: get(statuses, s.evaluationStatusId),
    })),
  }));
}

export async function loadModelResponse(db: D1Database, response: ModelResponse): Promise<LoadedModelResponse> {
  return (await loadModelResponses(db, [response]))[0];
}

/** Loads chat, inputs, the response graph and the inference status of every turn (same order). */
export async function loadChatTurns(db: D1Database, turns: ChatTurn[]): Promise<LoadedChatTurn[]> {
  if (!turns.length) return [];
  const turnIds = ids(turns.map((t) => t.id));
  const [chats, inputs, responses, statuses] = await Promise.all([
    byId(db, ChatEntity.TABLE, ids(turns.map((t) => t.chatId)), ChatEntity.fromRow),
    ChatTurnRepository.findInputsByTurnIds(db, turnIds),
    ModelResponseRepository.findAllById(db, ids(turns.map((t) => t.modelResponseId))),
    InferenceStatusRepository.findAllByChatTurnIdIn(db, turnIds),
  ]);
  const loadedResponses = await loadModelResponses(db, responses);
  const responseById = new Map(loadedResponses.map((r) => [r.id, r]));
  const statusByTurn = new Map(statuses.map((s) => [s.chatTurnId, s]));
  return turns.map((t) => ({
    ...t,
    chat: (t.chatId && chats.get(t.chatId)) || null,
    inputs: (t.id && inputs.get(t.id)) || [],
    modelResponse: (t.modelResponseId && responseById.get(t.modelResponseId)) || null,
    inferenceStatus: (t.id && statusByTurn.get(t.id)) || null,
  }));
}

export async function loadChatTurn(db: D1Database, turn: ChatTurn): Promise<LoadedChatTurn> {
  return (await loadChatTurns(db, [turn]))[0];
}
