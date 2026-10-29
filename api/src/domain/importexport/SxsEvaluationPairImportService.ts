/**
 * Port of domain/importexport/SxsEvaluationPairImportService + SxsEvaluationPairImportServiceImpl:
 * imports side-by-side pairs (chat A / chat B) from CSV/JSON, either from full chat JSON columns or
 * from single-turn columns (input, output_a, output_b, ...).
 *
 * As in ChatImportService, chats are saved with their turns in the batch instead of up front
 * (`chatService.createChat`), so failed records leave no orphan chats.
 */
import * as ChatEntity from "../../entities/Chat";
import type { Chat } from "../../entities/Chat";
import * as ChatTurnEntity from "../../entities/ChatTurn";
import type { Model } from "../../entities/Model";
import type { ModelInput } from "../../entities/ModelInput";
import * as ModelResponseEntity from "../../entities/ModelResponse";
import * as SXSHumanFeedbackEntity from "../../entities/SXSHumanFeedback";
import type { SXSHumanFeedback } from "../../entities/SXSHumanFeedback";
import * as SxsEvaluationPairEntity from "../../entities/SxsEvaluationPair";
import type { SxsEvaluationPair } from "../../entities/SxsEvaluationPair";
import { HumanSxsRatingValues, type HumanSxsRating } from "../../enums/HumanSxsRating";
import { InputRole } from "../../enums/InputRole";
import type { Ctx } from "../../lib/ctx";
import { ImportValidationException, RuntimeException } from "../../lib/errors";
import * as ChatCreationHelper from "../../util/ChatCreationHelper";
import * as ObjectMapperUtil from "../../util/ObjectMapperUtil";
import * as SXSHumanFeedbackRepository from "../evaluation/SXSHumanFeedbackRepository";
import * as SxsEvaluationPairRepository from "../evaluation/SxsEvaluationPairRepository";
import * as TagLinkRepository from "../tags/repository/TagLinkRepository";
import * as BaseImportService from "./BaseImportService";
import type { ImportContext } from "./dto/ImportContext";
import type { ImportResultDTO } from "./dto/ImportResultDTO";
import type { SXSHumanEvalRatingExportDTO } from "./dto/SXSHumanEvalRatingExportDTO";
import type { SxsImportRequest } from "./dto/SxsImportRequest";
import type { SxsProcessingResult } from "./dto/SxsProcessingResult";
import type { ChatTurnGraph, TurnCreationResult } from "./dto/TurnCreationResult";
import type { DataRecord } from "./dto/record/DataRecord";

/** java.io.IOException thrown by createChatAndTurns (reported as a record failure). */
class IOException extends Error {}

export async function importSxsPairs(ctx: Ctx, request: SxsImportRequest): Promise<ImportResultDTO> {
  const context = await BaseImportService.prepareImportContext(ctx, request.user, request.projectId, request);
  return BaseImportService.importFromFile<SxsProcessingResult>(ctx, request.file, context, { processRecord, saveBatch });
}

const isBlank = (s: string | null): s is null => s === null || !s.trim();

function newChat(context: ImportContext): Chat {
  const chat = ChatEntity.create({ containerId: context.sourceContainer.id, userId: context.user.id });
  ChatEntity.prePersist(chat);
  return chat;
}

async function processRecord(_ctx: Ctx, record: DataRecord, context: ImportContext): Promise<SxsProcessingResult> {
  const request = context.request as SxsImportRequest;
  const chatAJson = record.getValue(request.chatAColumnName);
  const chatBJson = record.getValue(request.chatBColumnName);
  if (isBlank(chatAJson)) return createPairFromColumns(record, context);

  const rating = record.getValue(request.ratingColumnName);
  const expectedOutput = record.getValue(request.expectedOutputColumnName);
  const csvVariables = parseVariables(record.getValue(request.variablesColumnName));

  const resultA = createChatAndTurns(chatAJson, context, request.chatAColumnName);
  const resultB = isBlank(chatBJson) ? null : createChatAndTurns(chatBJson, context, "chatB");

  updateExpectedOutputForChats(expectedOutput, resultA, resultB);
  mergeVariablesIntoChats(csvVariables, resultA.chat, resultB?.chat ?? null);
  const pair = buildSxsEvaluationPair(context, expectedOutput, csvVariables, resultA, resultB);

  const results = resultB ? [resultA, resultB] : [resultA];
  return {
    pair,
    turnResults: results.map(({ turns, turnIndexToTagsMap }) => ({ turns, turnIndexToTagsMap })),
    chats: results.map((r) => r.chat),
    humanSxsRatings: parseHumanSxsRatings(rating),
  };
}

async function saveBatch(ctx: Ctx, batchData: SxsProcessingResult[], context: ImportContext): Promise<void> {
  if (!batchData.length) return;
  const db = ctx.db;
  const stmts: D1PreparedStatement[] = [];
  for (const result of batchData) {
    for (const chat of result.chats) stmts.push(BaseImportService.chatStmt(db, chat));
    for (const turnResult of result.turnResults) stmts.push(...BaseImportService.chatTurnGraphStmts(db, turnResult.turns));
  }
  // Turn ids exist now: point the pairs at their latest turns.
  for (const result of batchData) {
    const [a, b] = result.turnResults;
    result.pair.chatTurnAId = a.turns[a.turns.length - 1].turn.id;
    if (b) result.pair.chatTurnBId = b.turns[b.turns.length - 1].turn.id;
    stmts.push(SxsEvaluationPairRepository.saveStmt(db, result.pair));
  }

  const links = batchData.flatMap((result) =>
    result.turnResults.flatMap((tr) =>
      BaseImportService.prepareTagLinks(
        tr.turnIndexToTagsMap,
        tr.turns.map((t) => t.turn),
        context,
      ),
    ),
  );
  if (context.tagCache.size) stmts.push(...BaseImportService.tagCacheStmts(db, context));
  for (const link of links) stmts.push(TagLinkRepository.saveStmt(db, link));

  for (const feedback of createHumanFeedbackForBatch(batchData, context)) {
    stmts.push(SXSHumanFeedbackRepository.saveStmt(db, feedback));
  }
  await db.batch(stmts);
}

interface ChatResult extends TurnCreationResult {
  chat: Chat;
}

function createChatAndTurns(chatJson: string | null, context: ImportContext, columnName: string | null): ChatResult {
  if (isBlank(chatJson)) {
    throw new IOException("Column '" + columnName + "' is mandatory and is missing or empty.");
  }
  const chat = newChat(context);
  const result = ChatCreationHelper.createTurnsFromJson(
    chatJson,
    chat,
    BaseImportService.asUser(context.user),
    context.modelMap,
    context.defaultHumanEvaluator,
    false,
    context.sourceContainer,
    context.evaluators,
  );
  if (!result.turns.length) {
    throw new IOException("Could not create turns from JSON for column '" + columnName + "'.");
  }
  result.turns.forEach((t, i) => (t.turn.sequenceId = i));
  return { ...result, chat };
}

/** Expected output goes on the last user input of each chat's latest turn. */
function updateExpectedOutputForChats(expectedOutput: string | null, a: ChatResult, b: ChatResult | null): void {
  if (isBlank(expectedOutput)) return;
  for (const r of b ? [a, b] : [a]) {
    const latest = r.turns[r.turns.length - 1];
    const userInput = latest ? ChatTurnEntity.getLastUserInput({ inputs: latest.inputs }) : null;
    if (userInput) userInput.expectedOutput = expectedOutput;
  }
}

function mergeVariablesIntoChats(csvVariables: Record<string, string>, chatA: Chat, chatB: Chat | null): void {
  for (const [key, value] of Object.entries(csvVariables)) {
    if (chatA.variables && !(key in chatA.variables)) chatA.variables[key] = value;
    if (chatB?.variables && !(key in chatB.variables)) chatB.variables[key] = value;
  }
}

/** chatTurnA/B (the latest turns) are filled in saveBatch once the turns have ids. */
function buildSxsEvaluationPair(
  context: ImportContext,
  expectedOutput: string | null,
  csvVariables: Record<string, string>,
  a: ChatResult,
  b: ChatResult | null,
): SxsEvaluationPair {
  return SxsEvaluationPairEntity.create({
    chatAId: a.chat.id,
    chatBId: b ? b.chat.id : null,
    containerId: context.sourceContainer.id,
    expectedOutput,
    variables: { ...(a.chat.variables ?? {}), ...csvVariables },
    userId: context.user.id,
  });
}

function createHumanFeedbackForBatch(batchData: SxsProcessingResult[], context: ImportContext): SXSHumanFeedback[] {
  const out: SXSHumanFeedback[] = [];
  for (const result of batchData) {
    const ratings = result.humanSxsRatings;
    if (!ratings || !ratings.length) continue;
    const bySequence = (turns: ChatTurnGraph[]) => new Map(turns.map((t) => [t.turn.sequenceId, t.turn]));
    const sideA = bySequence(result.turnResults[0].turns);
    const sideB = bySequence(result.turnResults.length > 1 ? result.turnResults[1].turns : []);
    for (const rating of ratings) {
      const a = sideA.get(rating.sequenceId);
      const b = sideB.get(rating.sequenceId);
      if (a && b) {
        out.push(
          SXSHumanFeedbackEntity.create({
            pairId: result.pair.id,
            projectId: result.pair.containerId,
            chatTurnA: a.id,
            chatTurnB: b.id,
            humanSxsRating: rating.rating,
            humanSxsNotes: rating.notes,
            userId: context.user.id,
          }),
        );
      }
    }
  }
  return out;
}

/** `new ObjectMapper().readValue(json, Map<String,String>)`; invalid JSON is logged and ignored. */
function parseVariables(variablesJson: string | null): Record<string, string> {
  if (isBlank(variablesJson)) return {};
  try {
    const v = JSON.parse(variablesJson);
    if (v === null) return null as unknown as Record<string, string>;
    if (typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== null && typeof val === "object") throw new Error("not a string");
      out[k] = val === null ? (null as unknown as string) : String(val);
    }
    return out;
  } catch {
    console.warn(`Could not parse variables JSON: ${variablesJson}`);
    return {};
  }
}

/** JSON list of `{ sequenceId, rating, notes }` (ObjectMapperUtil.convertJsonStringToList). */
function parseHumanSxsRatings(json: string | null): SXSHumanEvalRatingExportDTO[] {
  if (isBlank(json)) return [];
  const list = ObjectMapperUtil.convertJsonStringToList<Record<string, unknown>>(json);
  if (list === null) return null as unknown as SXSHumanEvalRatingExportDTO[];
  return list.map((item) => {
    if (item === null) return item as unknown as SXSHumanEvalRatingExportDTO;
    if (typeof item !== "object" || Array.isArray(item)) {
      throw new RuntimeException("Error converting JSON string to list");
    }
    const rating = item.rating ?? null;
    if (rating !== null && !HumanSxsRatingValues.includes(rating as HumanSxsRating)) {
      throw new RuntimeException("Error converting JSON string to list");
    }
    const seq = item.sequenceId;
    return {
      sequenceId: seq === null || seq === undefined ? null : Number(seq),
      rating: rating as HumanSxsRating | null,
      notes: item.notes === null || item.notes === undefined ? null : String(item.notes),
    };
  });
}

function createPairFromColumns(record: DataRecord, context: ImportContext): SxsProcessingResult {
  const request = context.request as SxsImportRequest;
  const input = record.getValue(request.inputColumnName);
  const expectedOutput = record.getValue(request.expectedOutputColumnName);
  const commonTags = record.getValue(request.tagsColumnName);
  const csvVariables = parseVariables(record.getValue(request.variablesColumnName));

  const side = (sys: string | null, out: string | null, label: string | null, llm: string | null, inf: string | null) =>
    createSingleTurnChat(input, sys, out, label, expectedOutput, commonTags, llm, inf, csvVariables, context);

  const resultA = side(
    record.getValue(request.systemInstructionAColumnName),
    record.getValue(request.outputAColumnName),
    record.getValue(request.modelLabelAColumnName),
    record.getValue(request.llmEvaluationsAColumnName),
    record.getValue(request.inferenceAnalyticsAColumnName),
  );
  const outputB = record.getValue(request.outputBColumnName);
  const resultB = isBlank(outputB)
    ? null
    : side(
        record.getValue(request.systemInstructionBColumnName),
        outputB,
        record.getValue(request.modelLabelBColumnName),
        record.getValue(request.llmEvaluationsBColumnName),
        record.getValue(request.inferenceAnalyticsBColumnName),
      );

  mergeVariablesIntoChats(csvVariables, resultA.chat, resultB?.chat ?? null);
  const pair = buildSxsEvaluationPair(context, expectedOutput, csvVariables, resultA, resultB);
  const results = resultB ? [resultA, resultB] : [resultA];
  return {
    pair,
    turnResults: results.map(({ turns, turnIndexToTagsMap }) => ({ turns, turnIndexToTagsMap })),
    chats: results.map((r) => r.chat),
    humanSxsRatings: parseSingleHumanSxsRating(
      record.getValue(request.ratingColumnName),
      record.getValue(request.notesColumnName),
    ),
  };
}

function createSingleTurnChat(
  input: string | null,
  systemInstruction: string | null,
  output: string | null,
  modelLabel: string | null,
  expectedOutput: string | null,
  tags: string | null,
  llmEvaluationsJson: string | null,
  inferenceAnalyticsJson: string | null,
  variables: Record<string, string>,
  context: ImportContext,
): ChatResult {
  const user = BaseImportService.asUser(context.user);
  const chat = newChat(context);
  const inputs: ModelInput[] = [];
  if (!isBlank(systemInstruction)) {
    inputs.push(ChatCreationHelper.createModelInput(systemInstruction, InputRole.SYSTEM, null, variables, user));
  }
  inputs.push(ChatCreationHelper.createModelInput(input, InputRole.USER, expectedOutput, variables, user));

  const graph: ChatTurnGraph = {
    turn: ChatTurnEntity.create({ chatId: chat.id, userId: context.user.id }),
    inputs,
    modelResponse: null,
    inferenceStatus: null,
  };
  if (!isBlank(output)) {
    // The response has no container here (Java never set it), so scores/statuses get none either.
    const response: ChatCreationHelper.ModelResponseGraph = {
      response: ModelResponseEntity.create({ text: output, userId: context.user.id }),
      humanEvalScores: [],
      scores: [],
      inferenceMonitoring: null,
    };
    let model: Model | null = null;
    if (modelLabel !== null && context.modelMap.has(modelLabel)) {
      model = context.modelMap.get(modelLabel)!;
      response.response.modelId = model.id;
    }
    BaseImportService.addScores(response, llmEvaluationsJson, context.user, context.evaluators, null);
    BaseImportService.addInferenceAnalytics(graph, response, inferenceAnalyticsJson, model, context.user, null, null);
    graph.modelResponse = response;
  }
  graph.turn.sequenceId = 0;

  const turnIndexToTagsMap = new Map<number, string>();
  if (!isBlank(tags)) turnIndexToTagsMap.set(0, tags);
  return { turns: [graph], turnIndexToTagsMap, chat };
}

function parseSingleHumanSxsRating(ratingStr: string | null, notesStr: string | null): SXSHumanEvalRatingExportDTO[] {
  if (isBlank(ratingStr)) return [];
  const rating = ratingStr.trim().toUpperCase();
  if (!HumanSxsRatingValues.includes(rating as HumanSxsRating)) {
    throw new ImportValidationException(
      "Invalid human rating value: '" + ratingStr + "'. Allowed values are: [" + HumanSxsRatingValues.join(", ") + "]",
    );
  }
  return [{ sequenceId: 0, rating: rating as HumanSxsRating, notes: notesStr }];
}
