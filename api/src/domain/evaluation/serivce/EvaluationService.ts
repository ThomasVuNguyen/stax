/**
 * Port of domain/evaluation/serivce/EvaluationService(+Impl) (the Java package typo is kept).
 *
 * Overloads of `generateScore`:
 * - `generateScore(ctx, request: ChatTurnEvaluationRequest, projectId, user)` (controller)
 * - `generateScoreForChatTurn(ctx, chatTurnId, evaluatorId, pairId, chatTurnIdA, chatTurnIdB, projectId, user)`
 * - `generateScoreWithStatus(ctx, pairId, chatTurnIdA, chatTurnIdB, evaluatorId, containerId, evaluationStatus, user, buildResult?)`
 *   (queue worker; `buildResult = false` skips building the response DTO nobody reads)
 *
 * A single-item evaluation runs the LLM call inside the request (as in Java); evaluating a project
 * or a list goes through EvaluationBatchService, which enqueues one job per (item, evaluator).
 * `user` arguments only need an `id`.
 */
import type { Ctx } from "../../../lib/ctx";
import {
  IllegalArgumentException,
  IllegalInputException,
  NotFoundException,
  RuntimeException,
} from "../../../lib/errors";
import type { ChatTurn } from "../../../entities/ChatTurn";
import type { EvaluationStatus } from "../../../entities/EvaluationStatus";
import type { LLMEvaluator } from "../../../entities/LLMEvaluator";
import type { Model } from "../../../entities/Model";
import * as ModelInputEntity from "../../../entities/ModelInput";
import type { ModelInput } from "../../../entities/ModelInput";
import type { ModelResponse } from "../../../entities/ModelResponse";
import type { PairwiseLLMEvaluator } from "../../../entities/PairwiseLLMEvaluator";
import * as PairwiseScoreEntity from "../../../entities/PairwiseScore";
import type { PairwiseScore } from "../../../entities/PairwiseScore";
import * as PointwiseHeuristicEvaluationScoreEntity from "../../../entities/PointwiseHeuristicEvaluationScore";
import type { PointwiseHeuristicEvaluationScore } from "../../../entities/PointwiseHeuristicEvaluationScore";
import type { PointwiseHeuristicEvaluator } from "../../../entities/PointwiseHeuristicEvaluator";
import * as ScoreV2Entity from "../../../entities/ScoreV2";
import type { ScoreV2 } from "../../../entities/ScoreV2";
import type { SxsEvaluationPair } from "../../../entities/SxsEvaluationPair";
import type { User } from "../../../entities/User";
import { CriteriaType } from "../../../enums/CriteriaType";
import { EvaluationStatusEnum } from "../../../enums/EvaluationStatusEnum";
import { EvaluationType } from "../../../enums/EvaluationType";
import { InputRole } from "../../../enums/InputRole";
import { ScoreType } from "../../../enums/ScoreType";
import * as ChatProviderFactory from "../../../llmproviders/ChatProviderFactory";
import type { ChatResponseWithLatency } from "../../../llmproviders/dto/ChatResponseWithLatency";
import { fromModelInput } from "../../../llmproviders/dto/Prompt";
import { parseJavaDouble } from "../../../util/NumberUtil";
import { convertJsonStringToList } from "../../../util/ObjectMapperUtil";
import { containsVariableInput, enrichText } from "../../../util/PromptUtil";
import * as ChatService from "../../chat/service/ChatService";
import * as ChatRepository from "../../chat/ChatRepository";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import * as EvaluationMonitoringService from "../../evaluationmonitoring/EvaluationMonitoringService";
import * as EvaluationStatusService from "../../evaluationstatus/EvaluationStatusService";
import type { EvaluatorVariableDTO } from "../../evaluator/dto/EvaluatorVariableDTO";
import * as PointwiseHeuristicEvaluatorRepository from "../../evaluator/heuristic/PointwiseHeuristicEvaluatorRepository";
import * as LLMEvaluatorRepository from "../../evaluator/llm/LLMEvaluatorRepository";
import * as PairwiseLLMEvaluatorRepository from "../../evaluator/pairwise/PairwiseLLMEvaluatorRepository";
import * as ModelRepository from "../../model/ModelRepository";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as EvaluationContainerRepository from "../../project/EvaluationContainerRepository";
import * as SXSChatRowDTO from "../../project/dto/SXSChatRowDTO";
import * as TagLinkService from "../../tags/TagLinkService";
import * as LLMChoiceOutputResponseDTO from "../LLMChoiceOutputResponseDTO";
import * as PairwiseScoreRepository from "../PairwiseScoreRepository";
import * as PointwiseHeuristicEvaluationScoreRepository from "../PointwiseHeuristicEvaluationScoreRepository";
import * as ScoreV2Repository from "../ScoreV2Repository";
import * as SxsEvaluationPairRepository from "../SxsEvaluationPairRepository";
import type { ChatTurnEvaluationRequest } from "../dto/ChatTurnEvaluationRequest";
import type { SXSPairEvaluationRequest } from "../dto/SXSPairEvaluationRequest";
import { type ScorerResponseDTO, toJson as scorerResponse } from "../dto/ScorerResponseDTO";
import * as EvaluationBatchService from "./EvaluationBatchService";

type UserRef = { id: string | null };

/** A chat turn with the EAGER relations the Java evaluation code navigated. */
export interface ChatTurnGraph extends ChatTurn {
  inputs: ModelInput[];
  modelResponse: ModelResponse | null;
}

// ---------------------------------------------------------------------------------------------
// Bulk entry points (enqueue jobs)
// ---------------------------------------------------------------------------------------------

export async function generateScoresFromProject(
  ctx: Ctx,
  projectId: string,
  evaluatorIds: string[] | null | undefined,
  user: UserRef,
): Promise<ScorerResponseDTO> {
  // EvaluationContainerService.getContainerForUser
  const container = await EvaluationContainerRepository.findByIdAndUser(ctx.db, projectId, user.id as string);
  if (!container) throw new NotFoundException(`Container not found for id: ${projectId}`);

  if (container.evaluationType === EvaluationType.SXS) {
    const pairs = await SxsEvaluationPairRepository.findByContainer(ctx.db, container.id as string);
    const pairRequests: SXSPairEvaluationRequest[] = pairs.map((p) => ({
      id: p.id as string,
      chat_turn_id_a: p.chatTurnAId,
      chat_turn_id_b: p.chatTurnBId,
    }));
    const jobId = await EvaluationBatchService.processLists(ctx, pairRequests, null, evaluatorIds, projectId, user);
    return scorerResponse({ jobId });
  }

  const chatTurnIds = await ChatTurnRepository.findLatestChatTurnIdsByContainerId(ctx.db, projectId, user.id as string);
  if (!chatTurnIds.length) {
    throw new IllegalInputException("Project does not have any chat turns. Provide a valid project.");
  }
  const jobId = await EvaluationBatchService.processProject(ctx, chatTurnIds, evaluatorIds, projectId, user);
  return scorerResponse({ jobId, chatTurnIds });
}

export async function generateScoresFromDataSet(
  ctx: Ctx,
  dataSetId: string,
  evaluatorIds: string[] | null | undefined,
  user: UserRef,
): Promise<ScorerResponseDTO> {
  const chatTurnIds = await ChatTurnRepository.findLatestChatTurnIdsByContainerId(ctx.db, dataSetId, user.id as string);
  if (!chatTurnIds.length) {
    throw new IllegalInputException("DataSet does not have any chat turns. Provide a valid DataSet.");
  }
  const jobId = await EvaluationBatchService.processDataSet(ctx, chatTurnIds, evaluatorIds, dataSetId, user);
  return scorerResponse({ jobId, chatTurnIds });
}

export async function generateScoresFromChatTurns(
  ctx: Ctx,
  chatTurnIds: string[] | null | undefined,
  pairs: SXSPairEvaluationRequest[] | null | undefined,
  evaluatorIds: string[] | null | undefined,
  projectId: string,
  user: UserRef,
): Promise<ScorerResponseDTO> {
  const jobId = await EvaluationBatchService.processLists(ctx, pairs ?? null, chatTurnIds ?? null, evaluatorIds, projectId, user);
  return scorerResponse({ jobId, chatTurnIds });
}

// ---------------------------------------------------------------------------------------------
// Single evaluation
// ---------------------------------------------------------------------------------------------

export async function generateScore(
  ctx: Ctx,
  request: ChatTurnEvaluationRequest,
  projectId: string,
  user: UserRef,
): Promise<unknown> {
  return generateScoreForChatTurn(
    ctx,
    request.chat_turn_id ?? null,
    request.evaluator_id as string,
    request.sxs_pair?.id ?? null,
    request.sxs_pair?.chat_turn_id_a ?? null,
    request.sxs_pair?.chat_turn_id_b ?? null,
    projectId,
    user,
  );
}

export async function generateScoreForChatTurn(
  ctx: Ctx,
  chatTurnId: string | null,
  evaluatorId: string,
  pairId: string | null,
  chatTurnIdA: string | null,
  chatTurnIdB: string | null,
  projectId: string | null,
  user: UserRef,
): Promise<unknown> {
  const effectiveChatTurnId = chatTurnIdA != null ? chatTurnIdA : chatTurnId;
  const evaluationStatus = await EvaluationStatusService.createEvaluationStatus(
    ctx,
    evaluatorId,
    effectiveChatTurnId as string,
    user.id as string,
    projectId,
  );
  return generateScoreWithStatus(ctx, pairId, effectiveChatTurnId, chatTurnIdB, evaluatorId, projectId, evaluationStatus, user);
}

/**
 * Runs one evaluation and drives its status: IN_PROGRESS → SUCCESSFUL, or FAILED with
 * "Evaluation error: <message>" (the error is rethrown). Returns a ChatTurnDTO (pointwise) or an
 * SXSChatRowDTO (pairwise) built before the status turns SUCCESSFUL, as in Java.
 */
export async function generateScoreWithStatus(
  ctx: Ctx,
  pairId: string | null,
  chatTurnIdA: string | null,
  chatTurnIdB: string | null,
  evaluatorId: string,
  containerId: string | null,
  evaluationStatus: EvaluationStatus,
  user: UserRef,
  buildResult = true,
): Promise<unknown> {
  try {
    await EvaluationStatusService.updateEvaluationStatusEntity(
      ctx,
      evaluationStatus,
      EvaluationStatusEnum.IN_PROGRESS,
      "Evaluation in-progress.",
    );
    const result = pairId
      ? await generateScoreFromSXSChatRow(ctx, pairId, chatTurnIdA, chatTurnIdB, evaluatorId, evaluationStatus, user, buildResult)
      : await generateScoresFromChatTurn(ctx, chatTurnIdA as string, evaluatorId, evaluationStatus, user, buildResult);
    await EvaluationStatusService.updateEvaluationStatusEntity(
      ctx,
      evaluationStatus,
      EvaluationStatusEnum.SUCCESSFUL,
      "Evaluation successful.",
    );
    return result;
  } catch (e) {
    console.error(`Evaluation failed due to Exception: ${(e as Error).message}`);
    await EvaluationStatusService.updateEvaluationStatusEntity(
      ctx,
      evaluationStatus,
      EvaluationStatusEnum.FAILED,
      `Evaluation error: ${(e as Error).message}`,
    );
    throw e;
  }
}

async function generateScoreFromSXSChatRow(
  ctx: Ctx,
  pairId: string,
  chatTurnAId: string | null,
  chatTurnBId: string | null,
  evaluatorId: string,
  evaluationStatus: EvaluationStatus,
  user: UserRef,
  buildResult: boolean,
): Promise<unknown> {
  const pair = await SxsEvaluationPairRepository.findByIdAndUser(ctx.db, pairId, user.id as string);
  if (!pair) throw new NotFoundException(`SXS Evaluation Pair not found with id: ${pairId}`);

  let chatTurnA: ChatTurn | null;
  let chatTurnB: ChatTurn | null;
  if (!chatTurnAId || !chatTurnBId) {
    chatTurnA = pair.chatTurnAId ? await ChatTurnRepository.findById(ctx.db, pair.chatTurnAId) : null;
    chatTurnB = pair.chatTurnBId ? await ChatTurnRepository.findById(ctx.db, pair.chatTurnBId) : null;
  } else {
    chatTurnA = await ChatTurnRepository.findByChatTurnIdAndUserId(ctx.db, chatTurnAId, user.id as string);
    if (!chatTurnA) throw new NotFoundException(`Chat Turn A not found with id: ${chatTurnAId}`);
    chatTurnB = await ChatTurnRepository.findByChatTurnIdAndUserId(ctx.db, chatTurnBId, user.id as string);
    if (!chatTurnB) throw new NotFoundException(`Chat Turn B not found with id: ${chatTurnBId}`);
  }
  if (!chatTurnA?.modelResponseId || !chatTurnB?.modelResponseId) {
    if (!chatTurnA || !chatTurnB) throw nullPointer("chatTurnA.getModelResponse()");
    throw new IllegalInputException("Both Chat Turns must have Model Responses to run evaluation.");
  }

  await runSXSEval(ctx, evaluatorId, user, pair, chatTurnA, chatTurnB, evaluationStatus);
  return buildResult ? SXSChatRowDTO.fromPair(ctx, pair, null) : null;
}

async function generateScoresFromChatTurn(
  ctx: Ctx,
  chatTurnId: string,
  evaluatorId: string,
  evaluationStatus: EvaluationStatus,
  user: UserRef,
  buildResult: boolean,
): Promise<unknown> {
  const chatTurn = await ChatTurnRepository.findByChatTurnIdAndUserId(ctx.db, chatTurnId, user.id as string);
  if (!chatTurn) {
    throw new NotFoundException(`Cannot generate scores because ChatTurn not found with chatTurnId: ${chatTurnId}`);
  }
  if (!chatTurn.modelResponseId) {
    throw new IllegalInputException(
      `Cannot generate scores because ModelResponse is missing for ChatTurn with id: ${chatTurnId}`,
    );
  }

  if (await LLMEvaluatorRepository.findSystemEvaluatorByIdOrUserEvaluatorByIdAndUser(ctx.db, evaluatorId, user.id as string)) {
    await runPointwiseLLMEval(ctx, evaluatorId, chatTurnId, evaluationStatus, user);
  } else {
    await runPointwiseHeuristicEval(ctx, evaluatorId, user, chatTurnId, evaluationStatus);
  }
  return buildResult ? ChatService.getChatTurnDTO(ctx, chatTurnId, user) : null;
}

/** Pairwise evaluation called from the queue (the pair and both turns must belong to the user). */
export async function runSxsEvalFromQueue(
  ctx: Ctx,
  evaluatorId: string,
  pairId: string,
  chatTurnIdA: string,
  chatTurnIdB: string,
  user: UserRef,
  evaluationStatus: EvaluationStatus,
): Promise<void> {
  const pair = await SxsEvaluationPairRepository.findByIdAndUser(ctx.db, pairId, user.id as string);
  if (!pair) throw new NotFoundException(`SXS Evaluation Pair not found with id: ${pairId}`);
  const chatTurnA = await retrieveChatTurn(ctx, chatTurnIdA, user);
  const chatTurnB = await retrieveChatTurn(ctx, chatTurnIdB, user);
  await runSXSEval(ctx, evaluatorId, user, pair, chatTurnA, chatTurnB, evaluationStatus);
}

// ---------------------------------------------------------------------------------------------
// Pointwise LLM
// ---------------------------------------------------------------------------------------------

async function runPointwiseLLMEval(
  ctx: Ctx,
  evaluatorId: string,
  chatTurnId: string,
  evaluationStatus: EvaluationStatus,
  user: UserRef,
): Promise<ScoreV2> {
  const chatTurn = await retrieveChatTurn(ctx, chatTurnId, user);
  const modelResponse = await retrieveModelResponse(ctx, chatTurn, chatTurnId);
  const llmEvaluator = await getLLMEvaluator(ctx, evaluatorId, user);

  const scoresFromModelResponse = await ScoreV2Repository.findByModelResponse_Id(ctx.db, modelResponse.id as string);
  const chat = await loadChat(ctx, chatTurn.chatId as string, user);
  const existingScore = findScoreInChatTurnList(scoresFromModelResponse, evaluatorId);

  const currentScore =
    existingScore ??
    ScoreV2Entity.create({
      userId: user.id,
      modelResponseId: modelResponse.id,
      llmEvaluatorId: llmEvaluator.id,
      evaluationStatusId: evaluationStatus.id,
      scoreType: llmEvaluator.outputFormatType,
      scorer: llmEvaluator.name,
    });

  const evalModel = await loadModel(ctx, llmEvaluator.modelId);
  const inputs = createEvaluatorPromptInputs(
    llmEvaluator.variables,
    await LLMEvaluatorRepository.findInputsByEvaluatorId(ctx.db, llmEvaluator.id as string),
    null,
    chat,
    null,
  );
  const response = await runEvaluationInference(ctx, user, evalModel, inputs);
  const container = await chatContainer(ctx, chatTurn);
  const evaluationMonitoring = await EvaluationMonitoringService.saveEvaluationMonitoring(
    ctx,
    user,
    response,
    evalModel,
    llmEvaluator,
    container,
  );

  const choice = LLMChoiceOutputResponseDTO.create(response.reply, llmEvaluator.outputCategories);
  currentScore.score = javaDoubleValueOf(choice.score);
  currentScore.llmResponse = response.reply;
  currentScore.evaluationMonitoringId = evaluationMonitoring.id;
  const saved = await ScoreV2Repository.save(ctx.db, currentScore);
  await TagLinkService.syncEvaluationMonitoringTags(ctx, evaluationMonitoring.id as string, user);
  return saved;
}

// ---------------------------------------------------------------------------------------------
// Pointwise heuristic
// ---------------------------------------------------------------------------------------------

export async function runPointwiseHeuristicEval(
  ctx: Ctx,
  evaluatorId: string,
  user: UserRef,
  chatTurnId: string,
  evaluationStatus: EvaluationStatus,
): Promise<PointwiseHeuristicEvaluationScore> {
  const chatTurn = await retrieveChatTurn(ctx, chatTurnId, user);
  const modelResponse = await retrieveModelResponse(ctx, chatTurn, chatTurnId);
  const evaluator = await PointwiseHeuristicEvaluatorRepository.findById(ctx.db, evaluatorId);
  if (!evaluator) {
    // jakarta EntityNotFoundException → RuntimeException handler
    throw new RuntimeException(`PointwiseHeuristicEvaluator with id '${evaluatorId}' not found for user '${user.id}'`);
  }

  const existing = findPointwiseHeuristicScoreInChatTurnList(
    await PointwiseHeuristicEvaluationScoreRepository.findByModelResponseId(ctx.db, modelResponse.id as string),
    evaluatorId,
  );
  const score =
    existing ??
    PointwiseHeuristicEvaluationScoreEntity.create({
      pointwiseEvaluatorId: evaluator.id,
      modelResponseId: modelResponse.id,
      evaluationStatusId: evaluationStatus.id,
      userId: user.id,
    });

  applyEvaluationLogic(score, evaluator, modelResponse.text);
  return PointwiseHeuristicEvaluationScoreRepository.save(ctx.db, score);
}

/** CONTAINS: case-sensitive substring; REGEX: case-insensitive, dot-all `find()`. */
export function applyEvaluationLogic(
  score: PointwiseHeuristicEvaluationScore,
  evaluator: PointwiseHeuristicEvaluator,
  textForEvaluation: string | null,
): void {
  if (evaluator.criteriaType == null) throw nullPointer("evaluator.getCriteriaType()");
  if (evaluator.criteriaType === CriteriaType.CONTAINS) {
    if (textForEvaluation == null) throw nullPointer("textForEvaluation");
    score.isMatch = textForEvaluation.includes(evaluator.criteria as string);
  } else if (evaluator.criteriaType === CriteriaType.REGEX) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(evaluator.criteria as string, "is");
    } catch {
      throw new IllegalInputException(`Invalid regex criteria for evaluator ID ${evaluator.id}: ${evaluator.criteria}`);
    }
    if (textForEvaluation == null) throw nullPointer("textForEvaluation");
    score.isMatch = pattern.test(textForEvaluation);
  }
}

// ---------------------------------------------------------------------------------------------
// Pairwise (SxS)
// ---------------------------------------------------------------------------------------------

export async function runSXSEval(
  ctx: Ctx,
  evaluatorId: string,
  user: UserRef,
  pair: SxsEvaluationPair,
  chatTurnA: ChatTurn | null,
  chatTurnB: ChatTurn | null,
  evaluationStatus: EvaluationStatus,
): Promise<PairwiseScore> {
  if (!chatTurnA || !chatTurnB) {
    throw new NotFoundException(`No chat turn found to run pairwise evaluation with evaluatorId: ${evaluatorId}`);
  }
  const llmEvaluator = await getPairwiseLLMEvaluator(ctx, evaluatorId, user);

  const filteredChatA = getChatUpToTurn(await loadChat(ctx, chatTurnA.chatId as string, user), chatTurnA);
  const filteredChatB = getChatUpToTurn(await loadChat(ctx, chatTurnB.chatId as string, user), chatTurnB);

  const evalModel = await loadModel(ctx, llmEvaluator.modelId);
  const inputs = createEvaluatorPromptInputs(
    llmEvaluator.variables,
    await PairwiseLLMEvaluatorRepository.findInputsByEvaluatorId(ctx.db, llmEvaluator.id as string),
    pair,
    filteredChatA,
    filteredChatB,
  );
  const response = await runEvaluationInference(ctx, user, evalModel, inputs);
  const evaluationMonitoring = await EvaluationMonitoringService.saveEvaluationMonitoringForPairwise(
    ctx,
    user,
    response,
    evalModel,
    llmEvaluator,
    await chatContainer(ctx, chatTurnA),
  );
  return processPairwiseEvaluatorResponse(ctx, user, pair, chatTurnA, chatTurnB, evaluationStatus, llmEvaluator, response, evaluationMonitoring.id);
}

/** Stores the A/B/TIE (category value) verdict on the pair's score for this evaluator. */
async function processPairwiseEvaluatorResponse(
  ctx: Ctx,
  user: UserRef,
  pair: SxsEvaluationPair,
  chatTurnA: ChatTurn,
  chatTurnB: ChatTurn,
  evaluationStatus: EvaluationStatus,
  llmEvaluator: PairwiseLLMEvaluator,
  response: ChatResponseWithLatency,
  evaluationMonitoringId: string | null,
): Promise<PairwiseScore> {
  const llmResponse = response.reply;
  const choice = LLMChoiceOutputResponseDTO.create(llmResponse, llmEvaluator.outputCategories);
  const existing = await PairwiseScoreRepository.findByPairAndChatTurnsAndEvaluatorAndUser(
    ctx.db,
    pair.id as string,
    chatTurnA.id as string,
    chatTurnB.id as string,
    llmEvaluator.id as string,
    user.id as string,
  );
  const currentScore =
    existing ??
    PairwiseScoreEntity.create({
      userId: user.id,
      chatTurnAId: chatTurnA.id,
      chatTurnBId: chatTurnB.id,
      pairId: pair.id,
      llmEvaluatorId: llmEvaluator.id,
      scoreType: llmEvaluator.outputFormatType,
      scorer: llmEvaluator.name,
      evaluationMonitoringId,
      evaluationStatusId: evaluationStatus.id,
    });
  currentScore.score = choice.score;
  currentScore.llmResponse = llmResponse;
  return PairwiseScoreRepository.saveAndFlush(ctx.db, currentScore);
}

function getChatUpToTurn<T extends ChatTurn>(chat: T[], chatTurn: ChatTurn): T[] {
  const i = chat.findIndex((t) => t.id === chatTurn.id);
  if (i < 0) throw new IllegalInputException("Chat turn not found in chat history");
  return chat.slice(0, i + 1);
}

async function getPairwiseLLMEvaluator(ctx: Ctx, evaluatorId: string, user: UserRef): Promise<PairwiseLLMEvaluator> {
  const e = await LLMEvaluatorRepository.findPairwiseEvaluatorByIdAndUser(ctx.db, evaluatorId, user.id as string);
  if (!e) throw new NotFoundException(`Pairwise LLMEvaluator with id '${evaluatorId}' not found for user '`);
  assertSupportedOutputFormat(e.outputFormatType);
  return e;
}

async function getLLMEvaluator(ctx: Ctx, evaluatorId: string, user: UserRef): Promise<LLMEvaluator> {
  const e = await LLMEvaluatorRepository.findSystemEvaluatorByIdOrUserEvaluatorByIdAndUser(ctx.db, evaluatorId, user.id as string);
  if (!e) throw new NotFoundException(`LLMEvaluator with id '${evaluatorId}' not found for user '${user.id}'`);
  assertSupportedOutputFormat(e.outputFormatType);
  return e;
}

function assertSupportedOutputFormat(type: ScoreType | null): void {
  if (type !== ScoreType.Choices && type !== ScoreType.Json) {
    throw new IllegalInputException(`Unsupported LLM Evaluator output format type: ${type}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Loading helpers
// ---------------------------------------------------------------------------------------------

async function retrieveChatTurn(ctx: Ctx, chatTurnId: string, user: UserRef): Promise<ChatTurn> {
  const t = await ChatTurnRepository.findByChatTurnIdAndUserId(ctx.db, chatTurnId, user.id as string);
  if (!t) throw new NotFoundException(`No chat turn found to run evaluation with chatTurnId: ${chatTurnId}`);
  return t;
}

async function retrieveModelResponse(ctx: Ctx, chatTurn: ChatTurn, chatTurnId: string): Promise<ModelResponse> {
  const mr = chatTurn.modelResponseId ? await ModelResponseRepository.findById(ctx.db, chatTurn.modelResponseId) : null;
  if (!mr) throw new IllegalInputException(`ChatTurn with id '${chatTurnId}' does not have a ModelResponse.`);
  return mr;
}

async function loadModel(ctx: Ctx, modelId: string | null): Promise<Model> {
  const model = modelId ? await ModelRepository.findById(ctx.db, modelId) : null;
  if (!model) throw nullPointer("llmEvaluator.getModel()");
  return model;
}

async function chatContainer(ctx: Ctx, chatTurn: ChatTurn): Promise<{ id: string | null } | null> {
  const chat = chatTurn.chatId ? await ChatRepository.findById(ctx.db, chatTurn.chatId) : null;
  return chat?.containerId ? { id: chat.containerId } : null;
}

/** ChatService.getChat(chatId, user): the user's turns of the chat, in sequence order, with inputs/response. */
async function loadChat(ctx: Ctx, chatId: string, user: UserRef): Promise<ChatTurnGraph[]> {
  const turns = await ChatTurnRepository.findByChatIdAndUserIdOrderBySequenceId(ctx.db, chatId, user.id as string, null, null);
  const ids = turns.map((t) => t.id as string);
  const responseIds = turns.map((t) => t.modelResponseId).filter((x): x is string => !!x);
  const [inputs, responses] = await Promise.all([
    ChatTurnRepository.findInputsByTurnIds(ctx.db, ids),
    ModelResponseRepository.findAllById(ctx.db, responseIds),
  ]);
  const byId = new Map(responses.map((r) => [r.id, r]));
  return turns.map((t) => ({
    ...t,
    inputs: inputs.get(t.id as string) ?? [],
    modelResponse: (t.modelResponseId && byId.get(t.modelResponseId)) || null,
  }));
}

/** InferenceService.runEvaluationInference: one blocking chat call with the evaluator's model. */
async function runEvaluationInference(
  ctx: Ctx,
  user: UserRef,
  model: Model,
  modelInputs: ModelInput[],
): Promise<ChatResponseWithLatency> {
  if (model.isDeprecated) throw new IllegalInputException("Model is deprecated");
  const prompts = modelInputs.map(fromModelInput);
  // The factory only reads the user's id (API key lookup).
  const strategy = await ChatProviderFactory.getStrategy(ctx, model, user as unknown as User);
  return strategy.chat(prompts);
}

// ---------------------------------------------------------------------------------------------
// Prompt templating
// ---------------------------------------------------------------------------------------------

/** Java NullPointerException surfaced through the RuntimeException handler. */
function nullPointer(what: string): RuntimeException {
  return new RuntimeException(`Cannot invoke method because "${what}" is null`);
}

/** Java String.replace(target, replacement): every literal occurrence; null replacement → NPE. */
function replaceAll(text: string, name: string, replacement: string | null | undefined): string {
  const target = `{{${name}}}`;
  if (replacement == null) {
    throw new RuntimeException('Cannot invoke "java.lang.CharSequence.toString()" because "replacement" is null');
  }
  return text.split(target).join(replacement);
}

/** Double.valueOf(String): null → NullPointerException, "NaN" → NaN (stored as NULL by D1). */
function javaDoubleValueOf(s: string | null): number | null {
  if (s == null) throw new RuntimeException('Cannot invoke "String.trim()" because "in" is null');
  const n = parseJavaDouble(s);
  return Number.isNaN(n) ? null : n;
}

function inputText(inp: ModelInput): string {
  const text = inp.text as string;
  return containsVariableInput(text) ? enrichText(text, inp.variables) : text;
}

/**
 * Builds the evaluator prompt by substituting `{{variable}}` placeholders in each of the
 * evaluator's input templates. Supported variables (matched on the lower-cased name):
 * history / history.a / history.b, prompt / input / input.a / input.b, output / output.a /
 * output.b, system.instruction, expected_output. (The Java switch also listed
 * "system.instruction.A"/"system.instruction.B", which can never match a lower-cased name.)
 */
export function createEvaluatorPromptInputs(
  variableStr: string | null,
  inputs: ModelInput[],
  pair: SxsEvaluationPair | null,
  chatA: ChatTurnGraph[] | null,
  chatB: ChatTurnGraph[] | null,
): ModelInput[] {
  const variableList = convertJsonStringToList<EvaluatorVariableDTO>(variableStr);
  if (variableList == null || !variableList.length) {
    throw new IllegalArgumentException("Evaluator variables must be provided to define the prompt structure.");
  }
  if (pair != null && (!chatA?.length || !chatB?.length)) {
    throw new IllegalArgumentException("Both chats must be provided and non-empty for pairwise evaluation.");
  }
  if (!chatA?.length) throw new IllegalArgumentException("Chat A cannot be null or empty for evaluation.");

  const variableMap = new Map<string, EvaluatorVariableDTO>();
  for (const v of variableList) {
    if (v == null) continue;
    if (variableMap.has(v.name as string)) throw new RuntimeException(`Duplicate key ${v.name}`);
    variableMap.set(v.name as string, v);
  }

  let expectedOutput: string | null;
  if (pair != null) {
    expectedOutput = pair.expectedOutput;
  } else {
    const lastInputs = chatA[chatA.length - 1].inputs;
    if (!lastInputs.length) throw new RuntimeException("Index -1 out of bounds for length 0");
    expectedOutput = lastInputs[lastInputs.length - 1].expectedOutput;
  }

  const finalInputs: ModelInput[] = [];
  for (const templateInput of inputs) {
    let templateText = templateInput.text as string;
    for (const variable of variableList) {
      const name = variable.name as string;
      switch (name.toLowerCase()) {
        case "history":
        case "history.a":
          templateText = handleHistoryVariable(templateText, chatA, name);
          break;
        case "history.b":
          templateText = handleHistoryVariable(templateText, chatB as ChatTurnGraph[], name);
          break;
        case "prompt":
        case "input":
        case "input.a":
        case "input.b":
          templateText = handleInputVariable(templateText, chatA, name, variableMap);
          break;
        case "output":
        case "output.a":
          templateText = handleOutputVariable(templateText, chatA, name, variableMap);
          break;
        case "output.b":
          templateText = handleOutputVariable(templateText, chatB as ChatTurnGraph[], name, variableMap);
          break;
        case "system.instruction":
          templateText = handleSystemInstructionVariable(templateText, chatA, name, variableMap);
          break;
        case "expected_output":
          handleMissingVariable(name, variableMap);
          templateText = replaceAll(templateText, name, expectedOutput);
          break;
        default:
          console.warn(`Unsupported variable in evaluator: ${name}`);
      }
    }
    finalInputs.push(ModelInputEntity.create({ text: templateText, role: templateInput.role }));
  }
  return finalInputs;
}

function handleMissingVariable(name: string, variableMap: Map<string, EvaluatorVariableDTO>): void {
  if (variableMap.get(name)?.required) {
    throw new IllegalArgumentException(`Variable '${name}' is required could not be extracted.`);
  }
}

function handleSystemInstructionVariable(
  templateText: string,
  chat: ChatTurnGraph[],
  name: string,
  variableMap: Map<string, EvaluatorVariableDTO>,
): string {
  for (let i = chat.length - 1; i >= 0; i--) {
    const turn = chat[i];
    if (!turn.inputs.length) continue;
    const instruction = turn.inputs
      .filter((inp) => inp != null && inp.text != null && inp.role === InputRole.SYSTEM)
      .map(inputText)
      .find((text) => text !== "");
    if (instruction !== undefined) return replaceAll(templateText, name, instruction);
  }
  handleMissingVariable(name, variableMap);
  return templateText;
}

function handleOutputVariable(
  templateText: string,
  chat: ChatTurnGraph[],
  name: string,
  variableMap: Map<string, EvaluatorVariableDTO>,
): string {
  const lastTurn = chat[chat.length - 1];
  if (lastTurn.modelResponse == null || lastTurn.modelResponse.text == null) handleMissingVariable(name, variableMap);
  if (lastTurn.modelResponse == null) throw nullPointer("lastTurn.getModelResponse()");
  return replaceAll(templateText, name, lastTurn.modelResponse.text);
}

function handleInputVariable(
  templateText: string,
  chat: ChatTurnGraph[],
  name: string,
  variableMap: Map<string, EvaluatorVariableDTO>,
): string {
  const lastTurn = chat[chat.length - 1];
  const userInputs = lastTurn.inputs.filter((inp) => inp != null && inp.text != null && inp.role === InputRole.USER);
  if (!userInputs.length) handleMissingVariable(name, variableMap);
  return replaceAll(templateText, name, userInputs.map(inputText).join("\n"));
}

function handleHistoryVariable(templateText: string, chat: ChatTurnGraph[], name: string): string {
  if (chat.length === 1) return replaceAll(templateText, name, "N/A");
  let history = "";
  for (const turn of chat.slice(0, chat.length - 1)) {
    for (const input of turn.inputs) {
      if (input != null && input.text != null) {
        history += `${input.role ?? "UNKNOWN_ROLE"}: ${inputText(input)}\n`;
      }
    }
    if (turn.modelResponse?.text != null) history += `ASSISTANT: ${turn.modelResponse.text}\n`;
    history += "\n";
  }
  return replaceAll(templateText, name, history.trim());
}

// ---------------------------------------------------------------------------------------------
// Score lookup helpers (public in Java)
// ---------------------------------------------------------------------------------------------

export function findPointwiseHeuristicScoreInChatTurnList(
  scores: PointwiseHeuristicEvaluationScore[] | null,
  heuristicEvaluatorId: string,
): PointwiseHeuristicEvaluationScore | null {
  return scores?.find((s) => s != null && s.pointwiseEvaluatorId === heuristicEvaluatorId) ?? null;
}

export function findScoreInChatTurnList(scores: ScoreV2[] | null, llmEvaluatorId: string): ScoreV2 | null {
  return scores?.find((s) => s != null && s.llmEvaluatorId === llmEvaluatorId) ?? null;
}
