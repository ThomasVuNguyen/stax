/**
 * Port of domain/importexport/BaseImportService (abstract class) as functions. The subclasses pass
 * their `processRecord` / `saveBatch` hooks to `importFromFile`.
 *
 * The Java services injected TagService/TagLinkService/ModelServiceImpl/HumanEvaluatorService/
 * NewLLMEvaluatorService/EvaluationContainerService only for thin repository wrappers
 * (findAllUserTags, buildModelMap, getEvaluators, getAllLLMScorer, getContainerForUser, saveAll);
 * those are called on the repositories directly here.
 *
 * Persistence: Java relied on JPA cascades from ChatTurn (inputs, modelResponse → humanEvalScores,
 * scores → evaluationStatus, inferenceMonitoring; inferenceStatus). `chatTurnGraphStmts` writes the
 * same rows explicitly, in FK order, for one `db.batch`.
 */
import type { Chat } from "../../entities/Chat";
import type { EvaluationContainer } from "../../entities/EvaluationContainer";
import * as InferenceMonitoringEntity from "../../entities/InferenceMonitoring";
import type { InferenceMonitoring } from "../../entities/InferenceMonitoring";
import type { LLMEvaluator } from "../../entities/LLMEvaluator";
import type { Model } from "../../entities/Model";
import * as TagEntity from "../../entities/Tag";
import * as TagLinkEntity from "../../entities/TagLink";
import type { TagLink } from "../../entities/TagLink";
import type { User } from "../../entities/User";
import { ModelType } from "../../enums/ModelType";
import { ScopeType } from "../../enums/ScopeType";
import { ScoringMechanismType } from "../../enums/ScoringMechanismType";
import { TagLinkTargetType } from "../../enums/TagLinkTargetType";
import { TagType } from "../../enums/TagType";
import type { Ctx } from "../../lib/ctx";
import {
  ImportValidationException,
  NotFoundException,
  RuntimeException,
  UnsupportedOperationException,
} from "../../lib/errors";
import * as ChatCreationHelper from "../../util/ChatCreationHelper";
import * as ChatRepository from "../chat/ChatRepository";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import * as HumanEvalScoreRepository from "../evaluation/HumanEvalScoreRepository";
import * as ScoreV2Repository from "../evaluation/ScoreV2Repository";
import * as EvaluationStatusRepository from "../evaluationstatus/EvaluationStatusRepository";
import * as HumanEvaluatorRepository from "../evaluator/human/HumanEvaluatorRepository";
import * as LLMEvaluatorRepository from "../evaluator/llm/LLMEvaluatorRepository";
import * as InferenceMonitoringRepository from "../inferencemonitoring/InferenceMonitoringRepository";
import * as InferenceStatusRepository from "../inferencestatus/InferenceStatusRepository";
import * as ModelRepository from "../model/ModelRepository";
import * as ModelResponseRepository from "../modelresponse/ModelResponseRepository";
import * as EvaluationContainerRepository from "../project/EvaluationContainerRepository";
import * as TagRepository from "../tags/repository/TagRepository";
import type { ImportContext } from "./dto/ImportContext";
import type { ImportRequest } from "./dto/ImportRequest";
import * as ImportResultDTO from "./dto/ImportResultDTO";
import { JSON_PROPERTIES as INFERENCE_ANALYTICS_PROPERTIES } from "./dto/InferenceAnalyticsDTO";
import type { ChatTurnGraph, ModelResponseGraph } from "./dto/TurnCreationResult";
import type { DataRecord } from "./dto/record/DataRecord";
import { CsvRecordProvider } from "./dto/record/CsvRecordProvider";
import { JsonRecordProvider } from "./dto/record/JsonRecordProvider";
import { IOException, type RecordProvider } from "./dto/record/RecordProvider";

const BATCH_SIZE = 50;
const RECORD_PROVIDERS: RecordProvider[] = [CsvRecordProvider, JsonRecordProvider];

/** LLMEvaluationDTO properties Jackson accepts (no @JsonIgnoreProperties → unknown ones fail). */
const LLM_EVALUATION_PROPERTIES = [
  "evaluator_id",
  "score",
  "llmResponse",
  "reasoning",
  "failureReason",
  "category",
  "evaluationStatus",
  "evaluationStatusText",
  "color",
];

export interface ImportHooks<T> {
  processRecord(ctx: Ctx, record: DataRecord, context: ImportContext): Promise<T | null>;
  saveBatch(ctx: Ctx, batchData: T[], context: ImportContext): Promise<void>;
}

/** Java `e.getMessage()` (null messages printed as "null"). */
export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message === undefined ? "null" : e.message;
  return String(e);
}

/** The helpers take the User entity but only read `id`. */
export function asUser(user: { id: string | null }): User {
  return user as User;
}

export async function importFromFile<T>(
  ctx: Ctx,
  file: Blob,
  context: ImportContext,
  hooks: ImportHooks<T>,
): Promise<ImportResultDTO.ImportResultDTO> {
  const contentType = file.type || null;
  const provider = RECORD_PROVIDERS.find((p) => p.supports(contentType));
  if (!provider) throw new UnsupportedOperationException("Unsupported file type: " + contentType);

  const result = ImportResultDTO.create();
  const batchData: T[] = [];
  let recordCounter = 0;

  let records: DataRecord[];
  try {
    records = await provider.getRecords(file);
  } catch (e) {
    if (e instanceof IOException) throw new RuntimeException("Critical error during file reading: " + e.message);
    throw e;
  }

  for (const record of records) {
    ImportResultDTO.incrementTotalRows(result);
    try {
      const processed = await hooks.processRecord(ctx, record, context);
      if (processed != null) {
        batchData.push(processed);
        ImportResultDTO.incrementSuccessfulRows(result);
      } else {
        ImportResultDTO.addFailure(result, "No processable content found in the record.", record.getRecordNumber());
      }
      // As in Java, the counter only advances for records that did not throw, and a failing batch
      // save is reported against the current record (the batch is kept and retried later).
      if (++recordCounter % BATCH_SIZE === 0 && batchData.length) {
        await hooks.saveBatch(ctx, batchData, context);
        batchData.length = 0;
      }
    } catch (e) {
      console.error(`Failed to process record ${record.getRecordNumber()} with an error: ${messageOf(e)}`);
      ImportResultDTO.addFailure(
        result,
        "Record " + record.getRecordNumber() + ": " + messageOf(e),
        record.getRecordNumber(),
      );
    }
  }
  if (batchData.length) await hooks.saveBatch(ctx, batchData, context);
  return result;
}

/**
 * Tag links for the saved turns of one TurnCreationResult. Missing tags are created in the tag cache
 * (Java saved them immediately; here they get their id now and are written by the caller, which saves
 * every cached tag before the links). `usedCount` of each linked tag is incremented.
 */
export function prepareTagLinks(
  turnIndexToTagsMap: Map<number, string>,
  savedTurns: { id: string | null }[],
  context: ImportContext,
): TagLink[] {
  const allLinksToCreate: TagLink[] = [];
  const entries = [...turnIndexToTagsMap.entries()].sort((a, b) => a[0] - b[0]);
  for (const [index, tags] of entries) {
    if (index >= savedTurns.length) continue;
    const targetTurn = savedTurns[index];
    const tagNames = [...new Set(tags.split(",").map((t) => t.trim()).filter((t) => t !== ""))];
    if (!tagNames.length) continue;

    for (const name of tagNames) {
      if (context.tagCache.has(name)) continue;
      const tag = TagEntity.create({ tagName: name, userId: context.user.id, type: TagType.USER });
      TagEntity.prePersist(tag);
      context.tagCache.set(name, tag);
    }
    for (const name of tagNames) {
      const tag = context.tagCache.get(name);
      if (!tag) continue;
      allLinksToCreate.push(
        TagLinkEntity.create({
          tagId: tag.tagId,
          targetId: targetTurn.id,
          targetType: TagLinkTargetType.CHAT_TURN,
          userId: context.user.id,
        }),
      );
      tag.usedCount = tag.usedCount + 1;
    }
  }
  return allLinksToCreate;
}

/** Statements saving every cached tag (new ones and usedCount updates). */
export function tagCacheStmts(db: D1Database, context: ImportContext): D1PreparedStatement[] {
  return [...context.tagCache.values()].map((t) => TagRepository.saveStmt(db, t));
}

export async function prepareImportContext(
  ctx: Ctx,
  user: { id: string | null },
  sourceId: string,
  request: ImportRequest,
): Promise<ImportContext> {
  const userId = user.id ?? "";
  const evaluators = await LLMEvaluatorRepository.findAllByUserOrType(ctx.db, userId, ScopeType.SYSTEM);
  const sourceContainer = await EvaluationContainerRepository.findByIdAndUser(ctx.db, sourceId, userId);
  if (!sourceContainer) throw new NotFoundException("Container not found for id: " + sourceId);

  // ModelServiceImpl.buildModelMap(user, Model::getLabel) with resolveModelMerge.
  const modelMap = new Map<string, Model>();
  for (const model of await ModelRepository.findNonDeprecatedUserAndSystemModels(ctx.db, userId)) {
    const key = model.label as string;
    const existing = modelMap.get(key);
    if (!existing) {
      modelMap.set(key, model);
      continue;
    }
    if (existing.type === ModelType.USER) continue;
    if (model.type === ModelType.USER) {
      modelMap.set(key, model);
      continue;
    }
    modelMap.set(key, existing.type === ModelType.SYSTEM ? existing : model);
  }

  const tagCache = new Map<string, TagEntity.Tag>();
  for (const tag of await TagRepository.findAllUserTags(ctx.db, userId)) {
    if (!tagCache.has(tag.tagName as string)) tagCache.set(tag.tagName as string, tag);
  }

  const defaultHumanEvaluator =
    (await HumanEvaluatorRepository.findByUser(ctx.db, userId)).find(
      (e) => e.scopeType === ScopeType.USER && e.scoringMechanismType === ScoringMechanismType.CATEGORY,
    ) ?? null;

  return { request, user, sourceContainer, tagCache, modelMap, defaultHumanEvaluator, evaluators };
}

/**
 * Reads a JSON object the way `new ObjectMapper().readValue(str, Dto.class)` did: unknown properties
 * and non-scalar values for scalar fields fail. Returns null for the JSON literal `null`.
 */
function readStrictObject(json: string, allowed: readonly string[]): Record<string, unknown> | null {
  const v = JSON.parse(json);
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
  for (const [k, val] of Object.entries(v)) {
    if (!allowed.includes(k)) throw new Error(`Unrecognized field "${k}"`);
    if (val !== null && typeof val === "object") throw new Error(`Cannot deserialize "${k}"`);
  }
  return v as Record<string, unknown>;
}

/** Jackson coercion of a scalar into String (numbers/booleans become their text). */
function scalarToString(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** Jackson coercion of a scalar into Double/Long; throws like an unboxing NullPointerException. */
function requireNumber(v: unknown, what: string): number {
  if (v === null || v === undefined) {
    throw new RuntimeException(`Cannot invoke "${what}" because the value is null`);
  }
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (typeof v === "boolean" || Number.isNaN(n)) throw new ImportValidationException(`Invalid number: '${v}'`);
  return n;
}

/** `response.setScores(...)` from the LLM evaluations JSON column. */
export function addScores(
  response: ModelResponseGraph,
  llmEvaluationsStr: string | null,
  user: { id: string | null },
  evaluators: LLMEvaluator[],
  container: EvaluationContainer | null,
): void {
  if (llmEvaluationsStr == null || !llmEvaluationsStr.trim()) return;
  let evaluationsMap: Record<string, Record<string, unknown> | null> | null;
  try {
    const parsed = JSON.parse(llmEvaluationsStr);
    if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) throw new Error("not an object");
    evaluationsMap = parsed;
    for (const v of Object.values(evaluationsMap ?? {})) {
      if (v === null) continue;
      if (typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
      readStrictObject(JSON.stringify(v), LLM_EVALUATION_PROPERTIES);
    }
  } catch {
    throw new ImportValidationException("LLM Evaluations is not a valid object: '" + llmEvaluationsStr + "'");
  }
  if (evaluationsMap === null) {
    throw new RuntimeException('Cannot invoke "java.util.Map.isEmpty()" because "evaluationsMap" is null');
  }
  const entries = Object.entries(evaluationsMap);
  if (!entries.length) return;
  response.scores = entries
    .map(([key, dto]) => {
      if (dto === null) {
        throw new RuntimeException('Cannot invoke "LLMEvaluationDTO.getScore()" because "evalDto" is null');
      }
      const evalDto = { ...dto, score: scalarToString(dto.score), llmResponse: scalarToString(dto.llmResponse) };
      return ChatCreationHelper.createScore([key, evalDto], asUser(user), container, evaluators);
    })
    .filter((s): s is ChatCreationHelper.ScoreGraph => s !== null);
}

/**
 * Inference analytics column → InferenceStatus SUCCESSFUL on the turn and an InferenceMonitoring on
 * the response (chat totals minus the previous turn's totals when there is a previous turn).
 */
export function addInferenceAnalytics(
  graph: ChatTurnGraph,
  response: ModelResponseGraph,
  inferenceAnalyticsStr: string | null,
  model: Model | null,
  user: { id: string | null },
  previousInferenceMonitoring: InferenceMonitoring | null,
  container: EvaluationContainer | null,
): void {
  if (inferenceAnalyticsStr == null || !inferenceAnalyticsStr.trim()) return;
  let dto: Record<string, unknown> | null;
  try {
    dto = readStrictObject(inferenceAnalyticsStr, INFERENCE_ANALYTICS_PROPERTIES);
  } catch {
    throw new ImportValidationException(
      "Inference Analytics is not a valid object: '" + inferenceAnalyticsStr + "'",
    );
  }
  graph.inferenceStatus = ChatCreationHelper.createInferenceStatus(asUser(user), container);
  if (!model) {
    throw new RuntimeException(
      'Cannot invoke "com.planck.planck.entitities.Model.getProvider()" because "model" is null',
    );
  }
  if (dto === null) {
    throw new RuntimeException('Cannot invoke "InferenceAnalyticsDTO.getTotalChatCompletionTokens()" because "inferenceAnalyticsDTO" is null');
  }
  const im = InferenceMonitoringEntity.createForTurn(model, user.id, container ? container.id : null, previousInferenceMonitoring);
  const long = (k: string) => Math.trunc(requireNumber(dto![k], `java.lang.Long.intValue()`));
  const prev = previousInferenceMonitoring;
  if (prev) {
    InferenceMonitoringEntity.setCompletionTokens(
      im,
      long("total_chat_completion_tokens") - requireNumber(prev.chatTotalCompletionTokens, "java.lang.Integer.intValue()"),
    );
    InferenceMonitoringEntity.setPromptTokens(
      im,
      long("total_chat_prompt_tokens") - requireNumber(prev.chatTotalPromptTokens, "java.lang.Integer.intValue()"),
    );
    InferenceMonitoringEntity.setTimetaken(
      im,
      Math.trunc(requireNumber(dto.total_chat_latency, "java.lang.Double.intValue()")) -
        requireNumber(prev.turnTimeTaken, "java.lang.Double.doubleValue()"),
    );
    InferenceMonitoringEntity.setTotalTokens(
      im,
      long("total_chat_tokens") - requireNumber(prev.chatTotalTokens, "java.lang.Integer.intValue()"),
    );
  } else {
    InferenceMonitoringEntity.setCompletionTokens(im, long("total_chat_completion_tokens"));
    InferenceMonitoringEntity.setPromptTokens(im, long("total_chat_prompt_tokens"));
    InferenceMonitoringEntity.setTimetaken(im, requireNumber(dto.total_chat_latency, "java.lang.Double.doubleValue()"));
    InferenceMonitoringEntity.setTotalTokens(im, long("total_chat_tokens"));
  }
  response.inferenceMonitoring = im;
}

/**
 * Statements persisting turn graphs (replaces `chatService.saveChat(turns)` + JPA cascades): inference
 * monitoring → model response → turn → inputs/turn_inputs → human scores → evaluation status → score
 * → inference status. Ids are assigned while the statements are built.
 */
export function chatTurnGraphStmts(db: D1Database, graphs: ChatTurnGraph[]): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const g of graphs) {
    const mr = g.modelResponse;
    if (mr) {
      if (mr.inferenceMonitoring) {
        out.push(InferenceMonitoringRepository.saveStmt(db, mr.inferenceMonitoring));
        mr.response.inferenceMonitoringId = mr.inferenceMonitoring.id;
      }
      out.push(ModelResponseRepository.saveStmt(db, mr.response));
      g.turn.modelResponseId = mr.response.id;
    }
    out.push(ChatTurnRepository.saveStmt(db, g.turn));
    out.push(...ChatTurnRepository.saveInputsStmts(db, g.turn.id as string, g.inputs));
    if (mr) {
      for (const h of mr.humanEvalScores) {
        h.modelResponseId = mr.response.id;
        out.push(HumanEvalScoreRepository.saveStmt(db, h));
      }
      for (const s of mr.scores) {
        out.push(EvaluationStatusRepository.saveStmt(db, s.evaluationStatus));
        s.score.evaluationStatusId = s.evaluationStatus.id;
        s.score.modelResponseId = mr.response.id;
        out.push(ScoreV2Repository.saveStmt(db, s.score));
      }
    }
    if (g.inferenceStatus) {
      g.inferenceStatus.chatTurnId = g.turn.id;
      out.push(InferenceStatusRepository.saveStmt(db, g.inferenceStatus));
    }
  }
  return out;
}

/** Statement saving a chat created during the import (`chatService.createChat(user, container)`). */
export function chatStmt(db: D1Database, chat: Chat): D1PreparedStatement {
  return ChatRepository.saveStmt(db, chat);
}
