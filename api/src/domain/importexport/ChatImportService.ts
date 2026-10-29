/**
 * Port of domain/importexport/ChatImportService + ChatImportServiceImpl: imports one chat per CSV/JSON
 * record into a project or dataset.
 *
 * Differences forced by Workers/D1:
 * - Java created (saved) the Chat at the start of processRecord via `chatService.createChat`; here the
 *   Chat is saved with its turns in the batch, so records that fail or yield no turns no longer leave
 *   an orphan, turn-less chat behind (those chats were invisible: rows/exports only list chats with turns).
 * - The NewLLMEvaluatorService.getAllLLMScorer call per record reuses the evaluators loaded in the context.
 */
import * as ChatEntity from "../../entities/Chat";
import type { Chat } from "../../entities/Chat";
import * as ChatTurnEntity from "../../entities/ChatTurn";
import * as HumanEvalScoreEntity from "../../entities/HumanEvalScore";
import type { HumanEvaluator } from "../../entities/HumanEvaluator";
import type { InferenceMonitoring } from "../../entities/InferenceMonitoring";
import type { LLMEvaluator } from "../../entities/LLMEvaluator";
import * as ModelResponseEntity from "../../entities/ModelResponse";
import type { Model } from "../../entities/Model";
import type { ModelInput } from "../../entities/ModelInput";
import { getMaxVariableKeysPerChat } from "../../config/ApplicationLimits";
import { InputRole } from "../../enums/InputRole";
import type { Ctx } from "../../lib/ctx";
import { ImportValidationException, RuntimeException } from "../../lib/errors";
import * as ChatCreationHelper from "../../util/ChatCreationHelper";
import * as TagLinkRepository from "../tags/repository/TagLinkRepository";
import * as BaseImportService from "./BaseImportService";
import type { ChatImportRequest } from "./dto/ChatImportRequest";
import type { ImportContext } from "./dto/ImportContext";
import type { ImportResultDTO } from "./dto/ImportResultDTO";
import type { ChatTurnGraph, ModelResponseGraph, TurnCreationResult } from "./dto/TurnCreationResult";
import type { DataRecord } from "./dto/record/DataRecord";

/** TurnCreationResult plus the (unsaved) chat its turns belong to. */
interface ChatTurnsResult extends TurnCreationResult {
  chat: Chat;
}

export async function importChatsFromFile(ctx: Ctx, request: ChatImportRequest): Promise<ImportResultDTO> {
  const context = await BaseImportService.prepareImportContext(ctx, request.user, request.sourceId, request);
  return BaseImportService.importFromFile<ChatTurnsResult>(ctx, request.file, context, { processRecord, saveBatch });
}

async function processRecord(_ctx: Ctx, record: DataRecord, context: ImportContext): Promise<ChatTurnsResult | null> {
  const request = context.request as ChatImportRequest;
  const user = BaseImportService.asUser(context.user);
  const chat = ChatEntity.create({ containerId: context.sourceContainer.id, userId: context.user.id });
  ChatEntity.prePersist(chat);

  const metadata = parseMetadata(record, request.metadataColumnNames);
  const metadataSize = Object.keys(metadata).length;
  if (metadataSize > getMaxVariableKeysPerChat()) {
    throw new RuntimeException(
      "Exceeded metadata key limit. Maximum allowed is " + getMaxVariableKeysPerChat() + ", but found " + metadataSize,
    );
  }
  chat.variables = metadata;

  const turnsForChat: ChatTurnGraph[] = [];
  const tagsForChat = new Map<number, string>();

  const useColumnsForLastTurn =
    record.getValue(request.inputColumnName) !== null ||
    record.getValue(request.outputColumnName) !== null ||
    record.getValue(request.expectedOutputColumnName) !== null;

  const chatJson = record.getValue(request.chatColumnName);
  const evaluators = context.evaluators;
  if (chatJson !== null && chatJson.trim()) {
    const jsonTurnsResult = ChatCreationHelper.createTurnsFromJson(
      chatJson,
      chat,
      user,
      context.modelMap,
      context.defaultHumanEvaluator,
      useColumnsForLastTurn,
      context.sourceContainer,
      evaluators,
    );
    turnsForChat.push(...jsonTurnsResult.turns);
    for (const [k, v] of jsonTurnsResult.turnIndexToTagsMap) tagsForChat.set(k, v);
  }

  if (useColumnsForLastTurn) {
    const monitorings = turnsForChat
      .map((t) => t.modelResponse?.inferenceMonitoring ?? null)
      .filter((m): m is InferenceMonitoring => m !== null);
    const previousInferenceMonitoring = monitorings.length ? monitorings[monitorings.length - 1] : null;
    const columnTurnResult = createTurnFromRowColumns(record, chat, context, request, previousInferenceMonitoring, evaluators);
    if (columnTurnResult.turns.length) {
      const tags = columnTurnResult.turnIndexToTagsMap.get(0);
      if (tags !== undefined) tagsForChat.set(turnsForChat.length, tags);
      turnsForChat.push(...columnTurnResult.turns);
    }
  }

  if (!turnsForChat.length) return null;
  turnsForChat.forEach((t, i) => (t.turn.sequenceId = i));
  return { chat, turns: turnsForChat, turnIndexToTagsMap: tagsForChat };
}

async function saveBatch(ctx: Ctx, batchData: ChatTurnsResult[], context: ImportContext): Promise<void> {
  if (!batchData.some((r) => r.turns.length)) return;
  const stmts: D1PreparedStatement[] = [];
  for (const result of batchData) {
    stmts.push(BaseImportService.chatStmt(ctx.db, result.chat));
    stmts.push(...BaseImportService.chatTurnGraphStmts(ctx.db, result.turns));
  }
  const links = batchData.flatMap((result) =>
    BaseImportService.prepareTagLinks(
      result.turnIndexToTagsMap,
      result.turns.map((t) => t.turn),
      context,
    ),
  );
  // Tags before links (FK); Java saved new tags inside prepareTagLinks and the whole cache afterwards.
  if (context.tagCache.size) stmts.push(...BaseImportService.tagCacheStmts(ctx.db, context));
  for (const link of links) stmts.push(TagLinkRepository.saveStmt(ctx.db, link));
  await ctx.db.batch(stmts);
}

/** Variables columns: a JSON object column is merged in, any other value is stored under the column name. */
function parseMetadata(record: DataRecord, metadataColumnNames: string[] | null): Record<string, string> {
  if (!metadataColumnNames || !metadataColumnNames.length) return {};
  const combined: Record<string, string> = {};
  for (const columnName of metadataColumnNames) {
    const columnValue = record.getValue(columnName);
    if (columnValue === null || !columnValue.trim()) continue;
    const jsonMeta = parseStringMap(columnValue);
    if (jsonMeta) Object.assign(combined, jsonMeta);
    else combined[columnName] = columnValue;
  }
  return combined;
}

/** `readValue(value, Map<String,String>)`: scalars are coerced to strings; anything else fails (null). */
function parseStringMap(value: string): Record<string, string> | null {
  try {
    const v = JSON.parse(value);
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== null && typeof val === "object") return null;
      out[k] = val === null ? (null as unknown as string) : String(val);
    }
    return out;
  } catch {
    return null;
  }
}

function createTurnFromRowColumns(
  record: DataRecord,
  chat: Chat,
  context: ImportContext,
  request: ChatImportRequest,
  previousInferenceMonitoring: InferenceMonitoring | null,
  evaluators: LLMEvaluator[],
): TurnCreationResult {
  const user = BaseImportService.asUser(context.user);
  const inputContent = record.getValue(request.inputColumnName);
  const systemInstruction = record.getValue(request.systemInstructionColumnName);
  const expectedOutput = record.getValue(request.expectedOutputColumnName);
  const tags = record.getValue(request.tagsColumnName);

  const inputs: ModelInput[] = [];
  if (systemInstruction !== null && systemInstruction.trim()) {
    inputs.push(ChatCreationHelper.createModelInput(systemInstruction, InputRole.SYSTEM, null, null, user));
  }
  inputs.push(ChatCreationHelper.createModelInput(inputContent, InputRole.USER, expectedOutput, null, user));

  const graph: ChatTurnGraph = {
    turn: ChatTurnEntity.create({ chatId: chat.id, userId: context.user.id }),
    inputs,
    modelResponse: null,
    inferenceStatus: null,
  };
  addModelResponse(graph, record, context, request, previousInferenceMonitoring, evaluators);

  const turnIndexToTagsMap = new Map<number, string>();
  if (tags !== null && tags.trim()) turnIndexToTagsMap.set(0, tags);
  return { turns: [graph], turnIndexToTagsMap };
}

function addModelResponse(
  graph: ChatTurnGraph,
  record: DataRecord,
  context: ImportContext,
  request: ChatImportRequest,
  previousInferenceMonitoring: InferenceMonitoring | null,
  evaluators: LLMEvaluator[],
): void {
  const outputContent = record.getValue(request.outputColumnName);
  const modelLabel = record.getValue(request.modelLabelColumnName);
  const humanEvalScoreStr = record.getValue(request.humanEvalScoreColumnName);
  const inferenceAnalyticsStr = record.getValue(request.inferenceAnalyticsColumnName);
  const llmEvaluationsStr = record.getValue(request.llmEvaluationsColumnName);

  const response: ModelResponseGraph = {
    response: ModelResponseEntity.create({
      text: outputContent,
      userId: context.user.id,
      containerId: context.sourceContainer.id,
    }),
    humanEvalScores: [],
    scores: [],
    inferenceMonitoring: null,
  };
  let model: Model | null = null;
  if (modelLabel !== null && context.modelMap.has(modelLabel)) {
    model = context.modelMap.get(modelLabel)!;
    response.response.modelId = model.id;
  }

  addHumanEvaluation(response, humanEvalScoreStr, context.defaultHumanEvaluator, context.user);
  BaseImportService.addInferenceAnalytics(
    graph,
    response,
    inferenceAnalyticsStr,
    model,
    context.user,
    previousInferenceMonitoring,
    context.sourceContainer,
  );
  BaseImportService.addScores(response, llmEvaluationsStr, context.user, evaluators, context.sourceContainer);
  graph.modelResponse = response;
}

function addHumanEvaluation(
  response: ModelResponseGraph,
  humanEvalScoreStr: string | null,
  defaultHumanEvaluator: HumanEvaluator | null,
  user: { id: string | null },
): void {
  let evalValue: number | null = null;
  if (humanEvalScoreStr !== null && humanEvalScoreStr.trim()) {
    evalValue = parseJavaInt(humanEvalScoreStr.trim());
    if (evalValue === null) {
      throw new ImportValidationException("HumanEvalScore is not a valid integer: '" + humanEvalScoreStr + "'");
    }
  }
  if (evalValue !== null) {
    if (!defaultHumanEvaluator) {
      throw new ImportValidationException(
        "Cannot assign HumanEvalScore because a default HumanEvaluator is not configured.",
      );
    }
    response.humanEvalScores = [
      HumanEvalScoreEntity.create({ score: evalValue, humanEvaluatorId: defaultHumanEvaluator.id, userId: user.id }),
    ];
  }
}

/** Integer.parseInt: optional sign, decimal digits, 32-bit range; null when invalid. */
function parseJavaInt(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= -2147483648 && n <= 2147483647 ? n : null;
}
