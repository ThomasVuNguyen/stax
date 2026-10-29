/**
 * Port of domain/importexport/ChatExportService + ChatExportServiceImpl.
 *
 * Java walked the lazily loaded entity graph (chat.turns → inputs, modelResponse → model,
 * inferenceMonitoring, humanEvalScores, scores → evaluationStatus/llmEvaluator) and looked up the tag
 * links of every turn. Here the graph of all requested chats is loaded in bulk (`loadChatTurns`).
 * ChatService.findByChatId / getAllChatIds and EvaluationContainerService.getContainerForUser were thin
 * repository wrappers and are called on the repositories directly. EvaluationScoreHelper.getLLMScores is
 * reproduced locally (`getLLMScores`) because it needs the loaded score relations.
 *
 * `getChatHistory(ctx, chat, user)` loads the chat's turns itself (Java received `chat.getTurns()`).
 */
import type { Chat } from "../../entities/Chat";
import type { ChatTurn } from "../../entities/ChatTurn";
import type { EvaluationStatus } from "../../entities/EvaluationStatus";
import * as EvaluationStatusEntity from "../../entities/EvaluationStatus";
import type { HumanEvalScore } from "../../entities/HumanEvalScore";
import type { InferenceMonitoring } from "../../entities/InferenceMonitoring";
import type { LLMEvaluator } from "../../entities/LLMEvaluator";
import type { Model } from "../../entities/Model";
import type { ModelInput } from "../../entities/ModelInput";
import type { ModelResponse } from "../../entities/ModelResponse";
import type { ScoreV2 } from "../../entities/ScoreV2";
import { EvaluationStatusEnumKey, getValueByKey } from "../../enums/EvaluationStatusEnum";
import { InputRole } from "../../enums/InputRole";
import { TagLinkTargetType } from "../../enums/TagLinkTargetType";
import type { Ctx } from "../../lib/ctx";
import { allIn } from "../../lib/db";
import { NotFoundException, RuntimeException } from "../../lib/errors";
import { CATEGORY_PATTERN } from "../../util/EvaluationPatternUtil";
import * as NumberUtil from "../../util/NumberUtil";
import { DEFAULT_EVALUATOR_CATEGORY_COLOR } from "../../util/PlanckConstants";
import * as ChatRepository from "../chat/ChatRepository";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import type { LLMEvaluationDTO } from "../evaluation/dto/LLMEvaluationDTO";
import * as LLMEvaluatorRepository from "../evaluator/llm/LLMEvaluatorRepository";
import * as InferenceMonitoringRepository from "../inferencemonitoring/InferenceMonitoringRepository";
import type { ModelTokens } from "../model/dto/ModelTokens";
import * as ModelRepository from "../model/ModelRepository";
import * as ModelResponseRepository from "../modelresponse/ModelResponseRepository";
import * as EvaluationContainerRepository from "../project/EvaluationContainerRepository";
import * as TagLinkRepository from "../tags/repository/TagLinkRepository";
import * as ChatExportDTO from "./dto/ChatExportDTO";
import type { InferenceAnalyticsDTO } from "./dto/InferenceAnalyticsDTO";
import * as AssistantMessageExportDTO from "./dto/message/AssistantMessageExportDTO";
import type { MessageExportDTO } from "./dto/message/BaseMessageExportDTO";
import * as SystemMessageExportDTO from "./dto/message/SystemMessageExportDTO";
import * as UserMessageExportDTO from "./dto/message/UserMessageExportDTO";

type UserRef = { id: string | null };

interface LoadedScore {
  score: ScoreV2;
  evaluationStatus: EvaluationStatus | null;
  llmEvaluator: LLMEvaluator | null;
}

/** A ChatTurn with the relations the export reads. */
interface LoadedTurn {
  turn: ChatTurn;
  inputs: ModelInput[];
  response: ModelResponse | null;
  model: Model | null;
  inferenceMonitoring: InferenceMonitoring | null;
  humanEvalScores: HumanEvalScore[];
  scores: LoadedScore[];
  /** mapTags(turn, user): the user's tag names joined by ",", or null. */
  tags: string | null;
}

export async function exportChats(ctx: Ctx, chatIds: string[], user: UserRef): Promise<ChatExportDTO.ChatExportDTO[]> {
  const userId = user.id ?? "";
  const chats = await ChatRepository.findByUserAndIdIn(ctx.db, userId, chatIds);
  const byId = new Map(chats.map((c) => [c.id, c]));
  const turns = await loadChatTurns(ctx, chats.map((c) => c.id as string), userId);
  return chatIds.map((chatId) => {
    const chat = byId.get(chatId);
    if (!chat) throw new NotFoundException("Chat not found: " + chatId);
    return toChatExportDTO(chat, turns.get(chatId) ?? []);
  });
}

export async function exportChat(ctx: Ctx, chatId: string, user: UserRef): Promise<ChatExportDTO.ChatExportDTO> {
  return (await exportChats(ctx, [chatId], user))[0];
}

export async function exportAllChats(ctx: Ctx, sourceId: string, user: UserRef): Promise<ChatExportDTO.ChatExportDTO[]> {
  const userId = user.id ?? "";
  const container = await EvaluationContainerRepository.findByIdAndUser(ctx.db, sourceId, userId);
  if (!container) throw new NotFoundException("Container not found for id: " + sourceId);
  const allChatIds = await ChatTurnRepository.findAllChatIdsByUserAndContainer(ctx.db, userId, container.id as string);
  return exportChats(ctx, allChatIds, user);
}

export async function getChatHistory(ctx: Ctx, chat: Chat | null, user: UserRef): Promise<MessageExportDTO[]> {
  if (!chat || !chat.id) return [];
  const turns = (await loadChatTurns(ctx, [chat.id], user.id ?? "")).get(chat.id) ?? [];
  if (!turns.length) return [];
  return buildFullChatHistory(turns);
}

function toChatExportDTO(chat: Chat, sortedTurns: LoadedTurn[]): ChatExportDTO.ChatExportDTO {
  const dto: ChatExportDTO.ChatExportDTO = { turns: 0, human_evaluation: 0 };
  if (!sortedTurns.length) return ChatExportDTO.toJson(dto);

  const tagsByTurnId = new Map<string, string>();
  for (const t of sortedTurns) if (t.tags) tagsByTurnId.set(t.turn.id as string, t.tags);

  populateTopLevelFields(dto, sortedTurns[sortedTurns.length - 1], chat);
  dto.turns = sortedTurns.length;
  dto.chat = buildFullChatHistory(sortedTurns);
  dto.system_instruction = extractLastSystemInstruction(sortedTurns);
  dto.inference_analytics = calculateInferenceAnalytics(sortedTurns);
  dto.tags = aggregateAllTags(tagsByTurnId);
  return ChatExportDTO.toJson(dto);
}

function aggregateAllTags(tagsByTurnId: Map<string, string>): string {
  const names = [...tagsByTurnId.values()].flatMap((s) => s.split(",")).map((s) => s.trim());
  return [...new Set(names)].join(",");
}

function calculateInferenceAnalytics(sortedTurns: LoadedTurn[]): InferenceAnalyticsDTO {
  let totalLatency = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let turnsWithLatency = 0;
  for (const t of sortedTurns) {
    const m = t.response ? t.inferenceMonitoring : null;
    if (!m) continue;
    if (m.turnTimeTaken != null) {
      totalLatency += m.turnTimeTaken;
      turnsWithLatency++;
    }
    if (m.turnPromptTokens != null) totalPromptTokens += m.turnPromptTokens;
    if (m.turnCompletionTokens != null) totalCompletionTokens += m.turnCompletionTokens;
  }
  return {
    total_chat_latency: totalLatency,
    average_chat_latency: turnsWithLatency > 0 ? NumberUtil.round(totalLatency / turnsWithLatency, 2) : 0,
    total_chat_prompt_tokens: totalPromptTokens,
    total_chat_completion_tokens: totalCompletionTokens,
    total_chat_tokens: totalPromptTokens + totalCompletionTokens,
  };
}

function populateTopLevelFields(dto: ChatExportDTO.ChatExportDTO, lastTurn: LoadedTurn, chat: Chat): void {
  const lastUserInput = lastTurn.inputs.find((i) => i.role === InputRole.USER);
  if (lastUserInput) {
    dto.input = lastUserInput.text;
    dto.expected_output = lastUserInput.expectedOutput;
  }
  const human = firstHumanEvalScore(lastTurn);
  if (human) {
    dto.human_evaluation = mapScoreToInt(human);
    dto.human_evaluation_notes = human.notes;
  }
  if (lastTurn.response) {
    dto.output = lastTurn.response.text;
    dto.model_nickname = lastTurn.model ? lastTurn.model.label : null;
    if (lastTurn.scores.length) dto.llm_evaluations = getLLMScores(lastTurn.scores);
  }
  if (chat.variables && Object.keys(chat.variables).length) dto.variables = chat.variables;
}

function buildFullChatHistory(sortedTurns: LoadedTurn[]): MessageExportDTO[] {
  return sortedTurns.flatMap((t) => [
    ...t.inputs.map(mapToMessageFromInput),
    ...(t.response ? [mapToAssistantMessage(t)] : []),
  ]);
}

function extractLastSystemInstruction(sortedTurns: LoadedTurn[]): string | null {
  const sys = sortedTurns.flatMap((t) => t.inputs).filter((i) => i.role === InputRole.SYSTEM);
  return sys.length ? sys[sys.length - 1].text : null;
}

function mapToMessageFromInput(input: ModelInput): MessageExportDTO {
  if (input.role === InputRole.SYSTEM) return SystemMessageExportDTO.create(input.text, input.variables);
  return UserMessageExportDTO.create(input.text, input.expectedOutput, input.variables);
}

function mapToAssistantMessage(t: LoadedTurn): MessageExportDTO {
  const response = t.response as ModelResponse;
  const m = t.inferenceMonitoring;
  const human = firstHumanEvalScore(t);
  return AssistantMessageExportDTO.create({
    content: response.text,
    model_nickname: t.model ? t.model.label : null,
    tags: t.tags,
    inference_latency: m ? m.turnTimeTaken : null,
    inference_tokens: m ? modelTokens(m.turnPromptTokens, m.turnCompletionTokens, m.turnTotalTokens) : null,
    llm_evaluations: t.scores.length ? getLLMScores(t.scores) : null,
    human_evaluation: human ? mapScoreToInt(human) : 0,
    human_evaluation_notes: human ? human.notes : null,
  });
}

/** `new ModelTokens(prompt, completion, total)` (thinking = total - (prompt + completion)). */
function modelTokens(prompt: number | null, completion: number | null, total: number | null): ModelTokens {
  if (prompt == null || completion == null || total == null) {
    throw new RuntimeException('Cannot invoke "java.lang.Integer.intValue()" because a token count is null');
  }
  return { input_tokens: prompt, output_tokens: completion, thinking_tokens: total - (prompt + completion), total_tokens: total };
}

function firstHumanEvalScore(t: LoadedTurn): HumanEvalScore | null {
  return t.response && t.humanEvalScores.length ? t.humanEvalScores[0] : null;
}

function mapScoreToInt(score: HumanEvalScore): number {
  if (score.score == null) return 0;
  if (score.score === 1) return 1;
  if (score.score === -1) return -1;
  return 0;
}

/** Double.toString for the score values shown in LLMEvaluationDTO.score. */
function javaDoubleToString(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
  const abs = Math.abs(n);
  if (abs === 0 || (abs >= 1e-3 && abs < 1e7)) return Number.isInteger(n) ? n.toFixed(1) : String(n);
  const [mant, exp] = n.toExponential().split("e");
  return `${mant.includes(".") ? mant : mant + ".0"}E${Number(exp)}`;
}

/** Port of EvaluationScoreHelper(scores).getLLMScores(): keyed by evaluator name. */
export function getLLMScores(scores: LoadedScore[]): Record<string, LLMEvaluationDTO> {
  const out: Record<string, LLMEvaluationDTO> = {};
  for (const { score, evaluationStatus, llmEvaluator } of scores) {
    if (!llmEvaluator) continue;
    const scoreValue = score.score != null ? javaDoubleToString(score.score) : null;
    const llmResponse = score.llmResponse;
    const match = llmResponse ? CATEGORY_PATTERN.exec(llmResponse) : null;
    const dto: Record<string, unknown> = {
      evaluator_id: llmEvaluator.id,
      score: scoreValue ?? "NaN",
      llmResponse,
      reasoning: match ? match[2].trim() : null,
      failureReason: null,
      category: match ? match[1] : null,
      evaluationStatus: "",
      evaluationStatusText: "",
      color: resolveColor(llmEvaluator.outputCategories, scoreValue),
    };
    if (evaluationStatus && evaluationStatus.status != null) {
      dto.evaluationStatus = String(evaluationStatus.status);
      if (evaluationStatus.status === EvaluationStatusEnumKey.FAILED) {
        if (evaluationStatus.comments != null) {
          dto.failureReason = evaluationStatus.comments;
          if (dto.reasoning == null) dto.reasoning = evaluationStatus.comments;
        } else {
          dto.failureReason = evaluationStatus.reason;
        }
      }
      dto.evaluationStatusText = getValueByKey(evaluationStatus.status);
    }
    out[llmEvaluator.name as string] = dto as unknown as LLMEvaluationDTO;
  }
  return out;
}

function resolveColor(outputCategoriesJson: string | null, scoreValue: string | null): string {
  if (outputCategoriesJson == null || scoreValue == null) return DEFAULT_EVALUATOR_CATEGORY_COLOR;
  let categories: unknown;
  try {
    categories = JSON.parse(outputCategoriesJson);
  } catch {
    return DEFAULT_EVALUATOR_CATEGORY_COLOR;
  }
  if (!Array.isArray(categories)) return DEFAULT_EVALUATOR_CATEGORY_COLOR;
  const match = categories.find((c) => c && c.value != null && String(c.value) === scoreValue);
  return match ? (match.color ?? null) : DEFAULT_EVALUATOR_CATEGORY_COLOR;
}

/** Turns of the given chats (sorted by sequenceId) with every relation the export needs. */
async function loadChatTurns(ctx: Ctx, chatIds: string[], userId: string): Promise<Map<string, LoadedTurn[]>> {
  const db = ctx.db;
  const out = new Map<string, LoadedTurn[]>();
  if (!chatIds.length) return out;
  const turns = await ChatTurnRepository.findByChatIn(db, chatIds);
  if (!turns.length) return out;
  const turnIds = turns.map((t) => t.id as string);
  const responseIds = turns.map((t) => t.modelResponseId).filter((id): id is string => id != null);

  const [inputsByTurn, responses, humanByResponse, scoresByResponse, tagLinks] = await Promise.all([
    ChatTurnRepository.findInputsByTurnIds(db, turnIds),
    ModelResponseRepository.findAllById(db, responseIds),
    ModelResponseRepository.findHumanEvalScoresByModelResponseIds(db, responseIds),
    ModelResponseRepository.findScoresByModelResponseIds(db, responseIds),
    TagLinkRepository.findByTargetIdsAndTargetType(db, turnIds, TagLinkTargetType.CHAT_TURN, userId),
  ]);
  const responseById = new Map(responses.map((r) => [r.id, r]));
  const allScores = [...scoresByResponse.values()].flat();
  const ids = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x != null))];

  const [models, monitorings, statuses, evaluators, tagsById] = await Promise.all([
    ModelRepository.findAllById(db, ids(responses.map((r) => r.modelId))),
    InferenceMonitoringRepository.findAllById(db, ids(responses.map((r) => r.inferenceMonitoringId))),
    allIn(db, (inn) => `SELECT * FROM evaluation_status WHERE id IN ${inn}`, ids(allScores.map((s) => s.evaluationStatusId))),
    LLMEvaluatorRepository.findAllById(db, ids(allScores.map((s) => s.llmEvaluatorId))),
    TagLinkRepository.findTagsByTagLinks(db, tagLinks),
  ]);
  const modelById = new Map(models.map((m) => [m.id, m]));
  const monitoringById = new Map(monitorings.map((m) => [m.id, m]));
  const statusById = new Map(statuses.map((r) => [String(r.id), EvaluationStatusEntity.fromRow(r)]));
  const evaluatorById = new Map(evaluators.map((e) => [e.id, e]));
  const tagNamesByTurn = new Map<string, string[]>();
  for (const link of tagLinks) {
    const list = tagNamesByTurn.get(link.targetId as string) ?? [];
    list.push(tagsById.get(link.tagId as string)?.tagName as string);
    tagNamesByTurn.set(link.targetId as string, list);
  }

  for (const turn of turns) {
    const response = turn.modelResponseId ? (responseById.get(turn.modelResponseId) ?? null) : null;
    const loaded: LoadedTurn = {
      turn,
      inputs: inputsByTurn.get(turn.id as string) ?? [],
      response,
      model: response?.modelId ? (modelById.get(response.modelId) ?? null) : null,
      inferenceMonitoring: response?.inferenceMonitoringId
        ? (monitoringById.get(response.inferenceMonitoringId) ?? null)
        : null,
      humanEvalScores: response ? (humanByResponse.get(response.id as string) ?? []) : [],
      scores: response
        ? (scoresByResponse.get(response.id as string) ?? []).map((score) => ({
            score,
            evaluationStatus: score.evaluationStatusId ? (statusById.get(score.evaluationStatusId) ?? null) : null,
            llmEvaluator: score.llmEvaluatorId ? (evaluatorById.get(score.llmEvaluatorId) ?? null) : null,
          }))
        : [],
      tags: tagNamesByTurn.get(turn.id as string)?.join(",") ?? null,
    };
    const list = out.get(turn.chatId as string) ?? [];
    list.push(loaded);
    out.set(turn.chatId as string, list);
  }
  for (const list of out.values()) list.sort((a, b) => (a.turn.sequenceId ?? 0) - (b.turn.sequenceId ?? 0));
  return out;
}
