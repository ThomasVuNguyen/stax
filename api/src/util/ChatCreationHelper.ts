import type { Chat } from "../entities/Chat";
import * as ChatTurnEntity from "../entities/ChatTurn";
import type { ChatTurn } from "../entities/ChatTurn";
import type { EvaluationContainer } from "../entities/EvaluationContainer";
import * as EvaluationStatusEntity from "../entities/EvaluationStatus";
import type { EvaluationStatus } from "../entities/EvaluationStatus";
import * as HumanEvalScoreEntity from "../entities/HumanEvalScore";
import type { HumanEvalScore } from "../entities/HumanEvalScore";
import type { HumanEvaluator } from "../entities/HumanEvaluator";
import * as InferenceMonitoringEntity from "../entities/InferenceMonitoring";
import type { InferenceMonitoring } from "../entities/InferenceMonitoring";
import * as InferenceStatusEntity from "../entities/InferenceStatus";
import type { InferenceStatus } from "../entities/InferenceStatus";
import type { LLMEvaluator } from "../entities/LLMEvaluator";
import type { Model } from "../entities/Model";
import * as ModelInputEntity from "../entities/ModelInput";
import type { ModelInput } from "../entities/ModelInput";
import * as ModelResponseEntity from "../entities/ModelResponse";
import type { ModelResponse } from "../entities/ModelResponse";
import type { ScoreV2 } from "../entities/ScoreV2";
import * as ScoreV2Entity from "../entities/ScoreV2";
import type { User } from "../entities/User";
import { EvaluationStatusEnumKey } from "../enums/EvaluationStatusEnum";
import { InferenceStatusEnumKey } from "../enums/InferenceStatusEnum";
import type { InputRole } from "../enums/InputRole";
import { ImportValidationException, RuntimeException } from "../lib/errors";
import { parseJavaDouble } from "./NumberUtil";

/**
 * Port of util/ChatCreationHelper (chat import: chat JSON -> turns).
 *
 * The Java code built a JPA object graph (ChatTurn.inputs, ModelResponse.humanEvalScores/scores/
 * inferenceMonitoring, ScoreV2.evaluationStatus, ChatTurn.inferenceStatus) that cascades persisted.
 * TS entities hold only FK ids, so the graph is returned explicitly (ChatTurnGraph etc.) with ids
 * and the FKs that point *inside* the graph left null; the import service assigns ids
 * (prePersist) and wires them (turn.modelResponseId, score.modelResponseId,
 * score.evaluationStatusId, inferenceStatus.chatTurnId, response.inferenceMonitoringId, ...)
 * while saving. FKs to existing rows (chat, user, model, container, evaluator) are set here.
 *
 * Message DTOs (domain/importexport/dto/message/*) are read inline from the JSON:
 * `role` = "user" | "assistant" | "system" (Jackson @JsonTypeInfo), snake_case fields.
 */

export interface ScoreGraph {
  score: ScoreV2;
  /** ScoreV2.evaluationStatus (cascade ALL). */
  evaluationStatus: EvaluationStatus;
}

export interface ModelResponseGraph {
  response: ModelResponse;
  humanEvalScores: HumanEvalScore[];
  scores: ScoreGraph[];
  /** Carries `previousInferenceMonitoring` (transient) for chained totals. */
  inferenceMonitoring: InferenceMonitoring | null;
}

export interface ChatTurnGraph {
  turn: ChatTurn;
  inputs: ModelInput[];
  modelResponse: ModelResponseGraph | null;
  inferenceStatus: InferenceStatus | null;
}

/** domain/importexport/dto/TurnCreationResult with graph-shaped turns. */
export interface TurnCreationResult {
  turns: ChatTurnGraph[];
  turnIndexToTagsMap: Map<number, string>;
}

/** LLMEvaluationDTO as found under `llm_evaluations` (only the fields used here). */
export interface ImportedLlmEvaluation {
  score: string | null;
  llmResponse?: string | null;
  [k: string]: unknown;
}

/** Jackson failures while reading the chat JSON (JsonProcessingException). */
export class JsonProcessingException extends RuntimeException {}

const ALLOWED_EVAL_SCORES = new Set([-1, 0, 1]);
/** EvaluationScoreHelper.normalizationPattern */
const NORMALIZATION_PATTERN = /[^a-zA-Z0-9]/g;

type Msg = Record<string, any>;

export function createTurnsFromJson(
  chatJson: string | null | undefined,
  chat: Chat,
  user: User,
  modelMap: Map<string, Model> | Record<string, Model>,
  defaultHumanEvaluator: HumanEvaluator | null,
  processUntilLast: boolean,
  container: EvaluationContainer | null,
  evaluators: LLMEvaluator[],
): TurnCreationResult {
  if (chatJson === null || chatJson === undefined || !chatJson.trim()) {
    return { turns: [], turnIndexToTagsMap: new Map() };
  }
  const messages = readMessages(chatJson);
  if (!messages || messages.length === 0) return { turns: [], turnIndexToTagsMap: new Map() };

  const turns: ChatTurnGraph[] = [];
  const turnIndexToTagsMap = new Map<number, string>();
  let currentInputs: ModelInput[] = [];

  const assistantMessagesCount = messages.filter((m) => m.role === "assistant").length;
  const limit = processUntilLast ? Math.max(0, assistantMessagesCount - 1) : assistantMessagesCount;
  let assistantMessagesProcessed = 0;

  let lastInferenceMonitoring: InferenceMonitoring | null = null;
  for (const m of messages) {
    if (m.role === "system") {
      currentInputs.push(createModelInput(str(m.content), "SYSTEM", null, m.variables ?? null, user));
    } else if (m.role === "user") {
      currentInputs.push(
        createModelInput(str(m.content), "USER", str(m.expected_output), m.variables ?? null, user),
      );
    } else {
      if (assistantMessagesProcessed >= limit) {
        currentInputs = [];
        continue;
      }
      const resolveModel = (label: string) =>
        modelMap instanceof Map ? modelMap.get(label) : Object.prototype.hasOwnProperty.call(modelMap, label) ? modelMap[label] : undefined;
      const turn: ChatTurnGraph = {
        turn: createChatTurn(chat, user),
        inputs: [...currentInputs],
        modelResponse: createModelResponse(m, user, resolveModel, defaultHumanEvaluator, container, lastInferenceMonitoring, evaluators),
        inferenceStatus: null,
      };
      if (m.inference_tokens !== null && m.inference_tokens !== undefined) {
        turn.inferenceStatus = createInferenceStatus(user, container);
      }
      turns.push(turn);
      const tags = str(m.tags);
      if (tags !== null && tags.trim()) turnIndexToTagsMap.set(turns.length - 1, tags);
      currentInputs = [];
      lastInferenceMonitoring = turn.modelResponse?.inferenceMonitoring ?? null;
      assistantMessagesProcessed++;
    }
  }

  if (!processUntilLast && currentInputs.length > 0) {
    turns.push({ turn: createChatTurn(chat, user), inputs: currentInputs, modelResponse: null, inferenceStatus: null });
  }
  return { turns, turnIndexToTagsMap };
}

function readMessages(chatJson: string): Msg[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(chatJson);
  } catch (e) {
    throw new JsonProcessingException(e instanceof Error ? e.message : String(e));
  }
  if (parsed === null) return null;
  if (!Array.isArray(parsed)) {
    throw new JsonProcessingException("Cannot deserialize value of type `java.util.ArrayList` from non-array value");
  }
  for (const m of parsed) {
    if (!m || typeof m !== "object" || m.role === undefined || m.role === null) {
      throw new JsonProcessingException(
        "Missing type id when trying to resolve subtype of BaseMessageExportDTO: missing type id property 'role'",
      );
    }
    if (!["user", "assistant", "system"].includes(m.role)) {
      throw new JsonProcessingException(
        `Could not resolve type id '${m.role}' as a subtype of BaseMessageExportDTO: known type ids = [assistant, system, user]`,
      );
    }
  }
  return parsed as Msg[];
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function createChatTurn(chat: Chat, user: User): ChatTurn {
  return ChatTurnEntity.create({ chatId: chat.id, userId: user.id });
}

export function createModelInput(
  text: string | null,
  role: InputRole,
  expectedOutput: string | null,
  metaData: Record<string, string> | null,
  user: User,
): ModelInput {
  return ModelInputEntity.create({ text, role, userId: user.id, variables: metaData, expectedOutput });
}

function createModelResponse(
  dto: Msg,
  user: User,
  resolveModel: (label: string) => Model | undefined,
  defaultHumanEvaluator: HumanEvaluator | null,
  container: EvaluationContainer | null,
  previousInferenceMonitoring: InferenceMonitoring | null,
  evaluators: LLMEvaluator[],
): ModelResponseGraph {
  const response = ModelResponseEntity.create({ text: str(dto.content), userId: user.id });
  const graph: ModelResponseGraph = { response, humanEvalScores: [], scores: [], inferenceMonitoring: null };

  let model: Model | null = null;
  const modelLabel = str(dto.model_nickname);
  if (modelLabel !== null) {
    model = resolveModel(modelLabel) ?? null;
    if (model) response.modelId = model.id;
  }

  // `human_evaluation` is a primitive int in the DTO: absent means 0, so a score is always created.
  const evalValue = dto.human_evaluation === null || dto.human_evaluation === undefined ? 0 : Number(dto.human_evaluation);
  graph.humanEvalScores = [createHumanEvalScore(evalValue, str(dto.human_evaluation_notes), user, defaultHumanEvaluator)];

  const tokens = dto.inference_tokens;
  if (tokens !== null && tokens !== undefined) {
    graph.inferenceMonitoring = createInferenceMonitoring(
      model,
      container,
      user,
      dto.inference_latency,
      tokens.input_tokens,
      tokens.output_tokens,
      tokens.total_tokens,
      previousInferenceMonitoring,
    );
  }

  const evaluations = dto.llm_evaluations as Record<string, ImportedLlmEvaluation> | null | undefined;
  if (evaluations !== null && evaluations !== undefined) {
    graph.scores = Object.entries(evaluations)
      .map((entry) => createScore(entry, user, container, evaluators))
      .filter((s): s is ScoreGraph => s !== null);
  }

  if (container) response.containerId = container.id;
  return graph;
}

/**
 * `createScore(entry, user, container, response, evaluators)`: null (Optional.empty) when no
 * evaluator's normalised name equals the entry key. `score.modelResponseId` is left to the caller
 * (pass it in `modelResponseId` when the response already exists, as BaseImportService does).
 */
export function createScore(
  evalDtoEntry: [string, ImportedLlmEvaluation],
  user: User,
  container: EvaluationContainer | null,
  evaluators: LLMEvaluator[],
  modelResponseId: string | null = null,
): ScoreGraph | null {
  const [key, evalDto] = evalDtoEntry;
  const llmEvaluator = evaluators.find((e) => (e.name ?? "").replace(NORMALIZATION_PATTERN, "") === key);
  if (!llmEvaluator) return null;

  const score = ScoreV2Entity.create({
    userId: user.id,
    modelResponseId,
    llmEvaluatorId: llmEvaluator.id,
    score: parseJavaDouble(evalDto.score),
    scoreType: llmEvaluator.outputFormatType,
    scorer: llmEvaluator.name,
    llmResponse: (evalDto.llmResponse as string | null | undefined) ?? null,
  });
  const evaluationStatus = EvaluationStatusEntity.create({
    userId: user.id,
    containerId: container ? container.id : null,
    evaluatorId: llmEvaluator.id,
    status: EvaluationStatusEnumKey.SUCCESSFUL,
  });
  return { score, evaluationStatus };
}

function requireValue<T>(v: T | null | undefined, what: string): T {
  // Java unboxed these Integer/Double values (NullPointerException when absent).
  if (v === null || v === undefined) throw new RuntimeException(`Cannot unbox null value: ${what}`);
  return v;
}

function createInferenceMonitoring(
  model: Model | null,
  container: EvaluationContainer | null,
  user: User,
  latency: number | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  totalTokens: number | null | undefined,
  previousInferenceMonitoring: InferenceMonitoring | null,
): InferenceMonitoring {
  if (!model) {
    throw new RuntimeException('Cannot invoke "Model.getProvider()" because "model" is null');
  }
  const im = InferenceMonitoringEntity.createForTurn(
    model,
    user.id,
    container ? container.id : null,
    previousInferenceMonitoring,
  );
  InferenceMonitoringEntity.setCompletionTokens(im, requireValue(outputTokens, "output_tokens"));
  InferenceMonitoringEntity.setPromptTokens(im, requireValue(inputTokens, "input_tokens"));
  InferenceMonitoringEntity.setTimetaken(im, requireValue(latency, "inference_latency"));
  InferenceMonitoringEntity.setTotalTokens(im, requireValue(totalTokens, "total_tokens"));
  return im;
}

/** InferenceStatus SUCCESSFUL for the user/container (`chatTurnId` is set by the caller). */
export function createInferenceStatus(user: User, container: EvaluationContainer | null): InferenceStatus {
  return InferenceStatusEntity.create({
    userId: user.id,
    containerId: container ? container.id : null,
    status: InferenceStatusEnumKey.SUCCESSFUL,
  });
}

function createHumanEvalScore(
  evalValue: number,
  notes: string | null,
  user: User,
  defaultHumanEvaluator: HumanEvaluator | null,
): HumanEvalScore {
  if (!ALLOWED_EVAL_SCORES.has(evalValue)) {
    throw new ImportValidationException(
      `Invalid HumanEvalScore value: '${evalValue}'. Allowed values are [-1, 0, 1]`,
    );
  }
  if (!defaultHumanEvaluator) {
    throw new ImportValidationException(
      "Cannot assign HumanEvalScore because a default HumanEvaluator is not configured.",
    );
  }
  return HumanEvalScoreEntity.create({
    score: evalValue,
    humanEvaluatorId: defaultHumanEvaluator.id,
    userId: user.id,
    notes,
  });
}
