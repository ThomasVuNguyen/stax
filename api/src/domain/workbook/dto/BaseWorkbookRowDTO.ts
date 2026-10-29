/**
 * Port of domain/workbook/dto/BaseWorkbookRowDTO (abstract base of the workbook row DTOs,
 * implements Taggable).
 *
 * Java built a row from the lazily loaded JPA graph of a ChatTurn (chat, inputs, modelResponse →
 * model / inferenceMonitoring / scores / humanEvalScores / heuristic scores, inferenceStatus).
 * Here the graph is loaded explicitly and in bulk with `loadChatTurns(db, turns)` and rows are
 * built synchronously from the loaded turns with `buildBaseRow(turn)`.
 *
 * JSON notes (what Jackson emitted):
 * - the Taggable getters `getId()` / `getTagLinkTargetType()` were serialised as "id" and
 *   "tagLinkTargetType";
 * - Lombok's is-getter of `boolean isChat` was serialised as "chat" next to the annotated "is_chat";
 * - `tags` was filled by TagResponseEnrichmentAdvice for every Taggable of a response (an empty
 *   list when the entity has none). `applyTags(ctx, rows)` does that explicitly.
 *
 * The llm / heuristic / pairwise evaluation maps come from EvaluationScoreHelper,
 * EvaluationPointwiseHeuristicScoreHelper and PairwiseScoreHelper (evaluation package) applied to
 * the loaded score rows (`llmScoresOf`, `heuristicScoresOf`, `pairwiseScoresOf`).
 */
import type { Ctx } from "../../../lib/ctx";
import { allIn } from "../../../lib/db";
import * as ChatEntity from "../../../entities/Chat";
import type { Chat } from "../../../entities/Chat";
import { type ChatTurn, getEnrichedInputText, getRawInputText } from "../../../entities/ChatTurn";
import * as EvaluationStatusEntity from "../../../entities/EvaluationStatus";
import type { EvaluationStatus } from "../../../entities/EvaluationStatus";
import type { HumanEvalScore } from "../../../entities/HumanEvalScore";
import * as HumanEvaluatorEntity from "../../../entities/HumanEvaluator";
import type { HumanEvaluator } from "../../../entities/HumanEvaluator";
import type { InferenceMonitoring } from "../../../entities/InferenceMonitoring";
import type { InferenceStatus } from "../../../entities/InferenceStatus";
import * as LLMEvaluatorEntity from "../../../entities/LLMEvaluator";
import type { LLMEvaluator } from "../../../entities/LLMEvaluator";
import type { Model } from "../../../entities/Model";
import type { ModelInput } from "../../../entities/ModelInput";
import type { ModelResponse } from "../../../entities/ModelResponse";
import * as PairwiseLLMEvaluatorEntity from "../../../entities/PairwiseLLMEvaluator";
import type { PairwiseLLMEvaluator } from "../../../entities/PairwiseLLMEvaluator";
import * as PairwiseScoreEntity from "../../../entities/PairwiseScore";
import type { PairwiseScore } from "../../../entities/PairwiseScore";
import type { PointwiseHeuristicEvaluationScore } from "../../../entities/PointwiseHeuristicEvaluationScore";
import * as PointwiseHeuristicEvaluatorEntity from "../../../entities/PointwiseHeuristicEvaluator";
import type { PointwiseHeuristicEvaluator } from "../../../entities/PointwiseHeuristicEvaluator";
import type { ScoreV2 } from "../../../entities/ScoreV2";
import { InputRole } from "../../../enums/InputRole";
import { ScoringMechanismType } from "../../../enums/ScoringMechanismType";
import type { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import { enrichTextForResponse } from "../../../util/PromptUtil";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import * as InferenceMonitoringRepository from "../../inferencemonitoring/InferenceMonitoringRepository";
import * as InferenceStatusRepository from "../../inferencestatus/InferenceStatusRepository";
import * as ModelRepository from "../../model/ModelRepository";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as TagLinkService from "../../tags/TagLinkService";
import { EvaluationScoreHelper, javaDoubleToString } from "../../evaluation/EvaluationScoreHelper";
import { EvaluationPointwiseHeuristicScoreHelper } from "../../evaluation/dto/EvaluationPointwiseHeuristicScoreHelper";
import { PairwiseScoreHelper } from "../../evaluation/dto/PairwiseScoreHelper";
import type { LLMEvaluationDTO } from "../../evaluation/dto/LLMEvaluationDTO";
import type { PointwiseHeuristicEvaluationDTO } from "../../evaluation/dto/PointwiseHeuristicEvaluationDTO";
import type { HumanEvalScoreDTO } from "../../evaluator/human/dto/HumanEvalScoreDTO";
import type { ModelTokens } from "../../model/dto/ModelTokens";
import type { TagDTO } from "../../tags/dto/TagDTO";

// ---------------------------------------------------------------------------------------------
// DTO

export interface BaseWorkbookRowDTO {
  input: string | null;
  raw_input: string | null;
  output: string | null;
  thinking_output: string | null;
  expected_output: string | null;
  model_response_id: string | null;
  chat_id: string | null;
  chat_turn_id: string | null;
  created_at: number | null;
  updated_at: number | null;
  model_id: string | null;
  model_name: string | null;
  /** @deprecated kept for the frontend; same value as model_nickname. */
  model_label: string | null;
  model_nickname: string | null;
  model_provider: string | null;
  model_properties: string | null;
  is_chat: boolean;
  inference_latency: number | null;
  inference_tokens: ModelTokens | null;
  inference_status: number | null;
  inference_reason: string | null;
  tags: TagDTO[] | null;
  sequence: number;
  human_eval_scores: HumanEvalScoreDTO[] | null;
  llm_evaluations: Record<string, LLMEvaluationDTO> | null;
  system_instructions: string | null;
  raw_system_instructions: string | null;
  variables: Record<string, string> | null;
  pointwise_heuristic_evaluations: Record<string, PointwiseHeuristicEvaluationDTO> | null;
  /** Taggable#getId() (chat turn id or chat id depending on the subclass). */
  id: string | null;
  /** Lombok is-getter of `isChat`. */
  chat: boolean;
  /** Taggable#getTagLinkTargetType(). */
  tagLinkTargetType: TagLinkTargetType;
}

/** Anything implementing Taggable: tags are looked up by (`tagLinkTargetType`, `id`). */
export interface Taggable {
  id: string | null;
  tagLinkTargetType: TagLinkTargetType;
  tags: TagDTO[] | null;
}

// ---------------------------------------------------------------------------------------------
// Loaded entity graph

export interface LoadedScoreV2 extends ScoreV2 {
  llmEvaluator: LLMEvaluator | null;
  evaluationStatus: EvaluationStatus | null;
}

export interface LoadedPointwiseHeuristicScore extends PointwiseHeuristicEvaluationScore {
  pointwiseEvaluator: PointwiseHeuristicEvaluator | null;
  evaluationStatus: EvaluationStatus | null;
}

export interface LoadedHumanEvalScore extends HumanEvalScore {
  humanEvaluator: HumanEvaluator | null;
}

export interface LoadedPairwiseScore extends PairwiseScore {
  llmEvaluator: PairwiseLLMEvaluator | null;
  evaluationStatus: EvaluationStatus | null;
}

export interface LoadedModelResponse extends ModelResponse {
  model: Model | null;
  inferenceMonitoring: InferenceMonitoring | null;
  humanEvalScores: LoadedHumanEvalScore[];
  scores: LoadedScoreV2[];
  pointwiseHeuristicEvaluationScores: LoadedPointwiseHeuristicScore[];
}

export interface LoadedChatTurn extends ChatTurn {
  chat: Chat | null;
  inputs: ModelInput[];
  modelResponse: LoadedModelResponse | null;
  inferenceStatus: InferenceStatus | null;
}

const uniq = (ids: (string | null | undefined)[]): string[] => [...new Set(ids.filter((x): x is string => !!x))];

async function byIds<T extends { id: string | null }>(
  db: D1Database,
  table: string,
  ids: string[],
  fromRow: (r: Record<string, unknown>) => T,
): Promise<Map<string, T>> {
  const rows = await allIn(db, (inn) => `SELECT * FROM "${table}" WHERE id IN ${inn}`, uniq(ids));
  return new Map(rows.map(fromRow).map((e) => [e.id as string, e]));
}

export async function loadEvaluationStatuses(db: D1Database, ids: (string | null)[]): Promise<Map<string, EvaluationStatus>> {
  return byIds(db, EvaluationStatusEntity.TABLE, uniq(ids), EvaluationStatusEntity.fromRow);
}

/** Loads the EAGER relations of model responses (model, monitoring, the three score collections). */
export async function loadModelResponses(
  db: D1Database,
  responses: ModelResponse[],
): Promise<Map<string, LoadedModelResponse>> {
  const ids = uniq(responses.map((r) => r.id));
  if (!ids.length) return new Map();
  const [models, monitorings, humanScores, scores, heuristicScores] = await Promise.all([
    ModelRepository.findAllById(db, uniq(responses.map((r) => r.modelId))),
    InferenceMonitoringRepository.findAllById(db, uniq(responses.map((r) => r.inferenceMonitoringId))),
    ModelResponseRepository.findHumanEvalScoresByModelResponseIds(db, ids),
    ModelResponseRepository.findScoresByModelResponseIds(db, ids),
    ModelResponseRepository.findPointwiseHeuristicEvaluationScoresByModelResponseIds(db, ids),
  ]);
  const allHuman = [...humanScores.values()].flat();
  const allScores = [...scores.values()].flat();
  const allHeuristic = [...heuristicScores.values()].flat();
  const [humanEvaluators, llmEvaluators, heuristicEvaluators, statuses] = await Promise.all([
    byIds(db, HumanEvaluatorEntity.TABLE, uniq(allHuman.map((s) => s.humanEvaluatorId)), HumanEvaluatorEntity.fromRow),
    byIds(db, LLMEvaluatorEntity.TABLE, uniq(allScores.map((s) => s.llmEvaluatorId)), LLMEvaluatorEntity.fromRow),
    byIds(
      db,
      PointwiseHeuristicEvaluatorEntity.TABLE,
      uniq(allHeuristic.map((s) => s.pointwiseEvaluatorId)),
      PointwiseHeuristicEvaluatorEntity.fromRow,
    ),
    loadEvaluationStatuses(db, [...allScores, ...allHeuristic].map((s) => s.evaluationStatusId)),
  ]);
  const modelById = new Map(models.map((m) => [m.id as string, m]));
  const monitoringById = new Map(monitorings.map((m) => [m.id as string, m]));
  const out = new Map<string, LoadedModelResponse>();
  for (const r of responses) {
    if (!r.id) continue;
    out.set(r.id, {
      ...r,
      model: (r.modelId && modelById.get(r.modelId)) || null,
      inferenceMonitoring: (r.inferenceMonitoringId && monitoringById.get(r.inferenceMonitoringId)) || null,
      humanEvalScores: (humanScores.get(r.id) ?? []).map((s) => ({
        ...s,
        humanEvaluator: (s.humanEvaluatorId && humanEvaluators.get(s.humanEvaluatorId)) || null,
      })),
      scores: (scores.get(r.id) ?? []).map((s) => ({
        ...s,
        llmEvaluator: (s.llmEvaluatorId && llmEvaluators.get(s.llmEvaluatorId)) || null,
        evaluationStatus: (s.evaluationStatusId && statuses.get(s.evaluationStatusId)) || null,
      })),
      pointwiseHeuristicEvaluationScores: (heuristicScores.get(r.id) ?? []).map((s) => ({
        ...s,
        pointwiseEvaluator: (s.pointwiseEvaluatorId && heuristicEvaluators.get(s.pointwiseEvaluatorId)) || null,
        evaluationStatus: (s.evaluationStatusId && statuses.get(s.evaluationStatusId)) || null,
      })),
    });
  }
  return out;
}

/**
 * Loads the JPA graph of chat turns (chat, inputs, model response with its relations, inference
 * status). The given turn objects are kept (spread), so transient fields such as
 * `effectiveSystemInstruction` survive. Order is preserved.
 */
export async function loadChatTurns(db: D1Database, turns: ChatTurn[]): Promise<LoadedChatTurn[]> {
  if (!turns.length) return [];
  const ids = uniq(turns.map((t) => t.id));
  const [inputs, chats, responses, inferenceStatuses] = await Promise.all([
    ChatTurnRepository.findInputsByTurnIds(db, ids),
    byIds(db, ChatEntity.TABLE, uniq(turns.map((t) => t.chatId)), ChatEntity.fromRow),
    ModelResponseRepository.findAllById(db, uniq(turns.map((t) => t.modelResponseId))),
    InferenceStatusRepository.findAllByChatTurnIdIn(db, ids),
  ]);
  const loadedResponses = await loadModelResponses(db, responses);
  const statusByTurn = new Map(inferenceStatuses.map((s) => [s.chatTurnId as string, s]));
  return turns.map((t) => ({
    ...t,
    chat: (t.chatId && chats.get(t.chatId)) || null,
    inputs: (t.id && inputs.get(t.id)) || [],
    modelResponse: (t.modelResponseId && loadedResponses.get(t.modelResponseId)) || null,
    inferenceStatus: (t.id && statusByTurn.get(t.id)) || null,
  }));
}

/** Pairwise scores (with their evaluator and status) of the given SxS pairs, grouped by pair id. */
export async function loadPairwiseScoresByPairIds(
  db: D1Database,
  pairIds: string[],
): Promise<Map<string, LoadedPairwiseScore[]>> {
  const out = new Map<string, LoadedPairwiseScore[]>(pairIds.map((id) => [id, []]));
  if (!pairIds.length) return out;
  const scores = (
    await allIn(db, (inn) => `SELECT * FROM "${PairwiseScoreEntity.TABLE}" WHERE sxs_evaluation_pair IN ${inn}`, uniq(pairIds))
  ).map(PairwiseScoreEntity.fromRow);
  const [evaluators, statuses] = await Promise.all([
    byIds(db, PairwiseLLMEvaluatorEntity.TABLE, uniq(scores.map((s) => s.llmEvaluatorId)), PairwiseLLMEvaluatorEntity.fromRow),
    loadEvaluationStatuses(db, scores.map((s) => s.evaluationStatusId)),
  ]);
  for (const s of scores) {
    const list = out.get(s.pairId as string) ?? [];
    list.push({
      ...s,
      llmEvaluator: (s.llmEvaluatorId && evaluators.get(s.llmEvaluatorId)) || null,
      evaluationStatus: (s.evaluationStatusId && statuses.get(s.evaluationStatusId)) || null,
    });
    out.set(s.pairId as string, list);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Row building

/** Java `Timestamp#getTime()` for the stored ISO strings. */
export function epochMillis(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const n = Date.parse(ts);
  return Number.isNaN(n) ? null : n;
}

/** `new ModelTokens(prompt, completion, total)` (thinking = total - (prompt + completion)). */
export function modelTokens(prompt: number | null, completion: number | null, total: number | null): ModelTokens {
  const thinking = prompt == null || completion == null || total == null ? null : total - (prompt + completion);
  return { input_tokens: prompt, output_tokens: completion, thinking_tokens: thinking, total_tokens: total };
}

function lastInputByRole(inputs: ModelInput[] | null, role: InputRole): ModelInput | null {
  if (!inputs) return null;
  const matching = inputs.filter((i) => i.role === role);
  return matching.length ? matching[matching.length - 1] : null;
}

function parseJsonList<T>(json: string | null | undefined): T[] | null {
  if (json == null) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : null;
  } catch {
    return null;
  }
}

/** `new HumanEvalScoreDTO(score)`. */
export function humanEvalScoreDTO(score: LoadedHumanEvalScore): HumanEvalScoreDTO {
  let categoryName: string | null = null;
  const evaluator = score.humanEvaluator;
  if (evaluator && evaluator.scoringMechanismType === ScoringMechanismType.CATEGORY) {
    const categories = parseJsonList<{ categoryName?: string | null; score?: number | null }>(evaluator.categories);
    for (const c of categories ?? []) {
      if (c.score != null && c.score === score.score) {
        categoryName = c.categoryName ?? null;
        break;
      }
    }
  }
  return {
    id: score.id,
    created_at: score.createdAt,
    updated_at: score.updatedAt,
    score: score.score,
    notes: score.notes,
    model_response_id: score.modelResponseId,
    user_id: score.userId,
    human_evaluator_id: score.humanEvaluatorId,
    category_name: categoryName,
  };
}

/**
 * The fields BaseWorkbookRowDTO(chatTurn) sets. `id` / `tagLinkTargetType` are filled in by the
 * subclass builders. A null turn yields the all-default row (Java returned early).
 */
export function buildBaseRow(
  turn: LoadedChatTurn | null,
  id: (row: BaseWorkbookRowDTO) => string | null,
  tagLinkTargetType: TagLinkTargetType,
): BaseWorkbookRowDTO {
  const row: BaseWorkbookRowDTO = {
    input: null,
    raw_input: null,
    output: null,
    thinking_output: null,
    expected_output: null,
    model_response_id: null,
    chat_id: null,
    chat_turn_id: null,
    created_at: null,
    updated_at: null,
    model_id: null,
    model_name: null,
    model_label: null,
    model_nickname: null,
    model_provider: null,
    model_properties: null,
    is_chat: false,
    inference_latency: null,
    inference_tokens: null,
    inference_status: null,
    inference_reason: null,
    tags: null,
    sequence: 0,
    human_eval_scores: null,
    llm_evaluations: null,
    system_instructions: null,
    raw_system_instructions: null,
    variables: null,
    pointwise_heuristic_evaluations: null,
    id: null,
    chat: false,
    tagLinkTargetType,
  };
  if (turn) {
    const inputs = turn.inputs;
    row.raw_input = getRawInputText(turn);
    row.input = getEnrichedInputText(turn);

    row.system_instructions = turn.effectiveSystemInstruction ?? null;
    if (row.system_instructions == null && inputs != null) {
      const systemInput = lastInputByRole(inputs, InputRole.SYSTEM);
      if (systemInput) {
        row.raw_system_instructions = systemInput.text;
        row.system_instructions = enrichTextForResponse(systemInput.text, systemInput.variables);
      }
    }

    const response = turn.modelResponse;
    row.output = response == null ? "" : response.text;
    row.thinking_output = response == null ? "" : response.thinking;
    row.expected_output = !inputs || !inputs.length ? null : inputs[inputs.length - 1].expectedOutput;

    row.chat_id = turn.chat?.id ?? turn.chatId;
    row.variables = turn.chat?.variables ?? null;
    row.chat_turn_id = turn.id;
    row.created_at = epochMillis(turn.createdAt);
    row.updated_at = epochMillis(turn.updatedAt);

    if (response) {
      row.model_response_id = response.id;
      const model = response.model;
      if (model) {
        row.model_id = model.id;
        row.model_name = model.name;
        row.model_label = model.label;
        row.model_nickname = model.label;
        row.model_provider = model.provider ?? null;
        row.model_properties = model.properties;
      }
      const im = response.inferenceMonitoring;
      if (im) {
        row.inference_latency = im.turnTimeTaken;
        row.inference_tokens = modelTokens(im.turnPromptTokens, im.turnCompletionTokens, im.turnTotalTokens);
      }
      if (response.humanEvalScores.length) row.human_eval_scores = response.humanEvalScores.map(humanEvalScoreDTO);
      if (response.scores.length) row.llm_evaluations = llmScoresOf(response.scores);
      if (response.pointwiseHeuristicEvaluationScores.length) {
        row.pointwise_heuristic_evaluations = heuristicScoresOf(response.pointwiseHeuristicEvaluationScores);
      }
    }

    row.is_chat = (turn.sequenceId ?? 0) >= 1;
    row.sequence = turn.sequenceId ?? 0;
    if (turn.inferenceStatus) {
      row.inference_status = turn.inferenceStatus.status;
      row.inference_reason = turn.inferenceStatus.reason;
    }
  }
  row.chat = row.is_chat;
  row.id = id(row);
  return row;
}

// ---------------------------------------------------------------------------------------------
// Evaluation score maps (evaluation package helpers)

export { javaDoubleToString };

/** `new EvaluationScoreHelper(scores).getLLMScores()`. */
export function llmScoresOf(scores: LoadedScoreV2[]): Record<string, LLMEvaluationDTO> {
  return new EvaluationScoreHelper(scores).getLLMScores();
}

/** `new EvaluationPointwiseHeuristicScoreHelper(scores).getPointwiseHeuristicScores()`. */
export function heuristicScoresOf(
  scores: LoadedPointwiseHeuristicScore[],
): Record<string, PointwiseHeuristicEvaluationDTO> {
  return new EvaluationPointwiseHeuristicScoreHelper(scores).getPointwiseHeuristicScores();
}

/** `new PairwiseScoreHelper(scores, chatTurnA, chatTurnB).getPairwiseEvaluationScores()`. */
export function pairwiseScoresOf(
  scores: LoadedPairwiseScore[],
  chatTurnA: { id: string | null } | null,
  chatTurnB: { id: string | null } | null,
): Record<string, LLMEvaluationDTO> {
  return new PairwiseScoreHelper(scores, chatTurnA, chatTurnB).getPairwiseEvaluationScores();
}

// ---------------------------------------------------------------------------------------------
// Tags (TagResponseEnrichmentAdvice)

/**
 * Sets `tags` on every Taggable (an empty list when it has none), grouping the lookups by target
 * type like TagResponseEnrichmentAdvice. Returns whether any tag was found.
 */
export async function applyTags(ctx: Ctx, user: { id: string | null }, items: Taggable[]): Promise<boolean> {
  if (!items.length) return false;
  const idsByType = new Map<TagLinkTargetType, string[]>();
  for (const t of items) {
    const list = idsByType.get(t.tagLinkTargetType) ?? [];
    list.push(t.id as string);
    idsByType.set(t.tagLinkTargetType, list);
  }
  const idToTags = new Map<string, TagDTO[]>();
  for (const [type, ids] of idsByType) {
    const res = await TagLinkService.getUserTagsByTargetTypeAndEntityList(ctx, ids, type, user);
    for (const [id, tags] of res) idToTags.set(id, tags);
  }
  let hasTags = false;
  for (const t of items) {
    const tags = (t.id != null && idToTags.get(t.id)) || [];
    t.tags = tags;
    if (tags.length) hasTags = true;
  }
  return hasTags;
}
