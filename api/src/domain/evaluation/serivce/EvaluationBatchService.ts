/**
 * Port of domain/evaluation/serivce/EvaluationBatchService(+Impl).
 *
 * Creates the scorer JobStatus, (re)sets one EvaluationStatus per (chat turn | SxS pair, evaluator)
 * to PENDING, pre-creates the score rows linked to the new statuses and then enqueues one
 * `llm-eval` / `heuristic-eval` job per status (Java published after commit; here after the
 * writes). No LLM call happens in the request.
 */
import type { Ctx } from "../../../lib/ctx";
import { allIn, chunk } from "../../../lib/db";
import { IllegalInputException, NotImplementedException, RuntimeException } from "../../../lib/errors";
import type { EvaluationContainer } from "../../../entities/EvaluationContainer";
import * as EvaluationStatusEntity from "../../../entities/EvaluationStatus";
import type { EvaluationStatus } from "../../../entities/EvaluationStatus";
import type { JobStatus } from "../../../entities/JobStatus";
import type { LLMEvaluator } from "../../../entities/LLMEvaluator";
import type { PairwiseLLMEvaluator } from "../../../entities/PairwiseLLMEvaluator";
import * as PairwiseScoreEntity from "../../../entities/PairwiseScore";
import type { PairwiseScore } from "../../../entities/PairwiseScore";
import * as PointwiseHeuristicEvaluationScoreEntity from "../../../entities/PointwiseHeuristicEvaluationScore";
import type { PointwiseHeuristicEvaluator } from "../../../entities/PointwiseHeuristicEvaluator";
import * as ScoreV2Entity from "../../../entities/ScoreV2";
import { EvaluationStatusEnum, getKey } from "../../../enums/EvaluationStatusEnum";
import { JobStatusEnum } from "../../../enums/JobStatusEnum";
import { ScopeType } from "../../../enums/ScopeType";
import { EVAL } from "../../../util/PlanckConstants";
import * as ChatRepository from "../../chat/ChatRepository";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import * as EvaluationStatusRepository from "../../evaluationstatus/EvaluationStatusRepository";
import * as PointwiseHeuristicEvaluatorRepository from "../../evaluator/heuristic/PointwiseHeuristicEvaluatorRepository";
import * as LLMEvaluatorRepository from "../../evaluator/llm/LLMEvaluatorRepository";
import * as PairwiseLLMEvaluatorService from "../../evaluator/pairwise/service/PairwiseLLMEvaluatorService";
import * as JobStatusService from "../../job/JobStatusService";
import * as EvaluationContainerRepository from "../../project/EvaluationContainerRepository";
import * as LLMScoreQueueService from "../../pubsub/LLMScoreQueueService";
import * as PointwiseHeuristicEvaluationScoreQueueService from "../../pubsub/PointwiseHeuristicEvaluationScoreQueueService";
import * as PairwiseScoreRepository from "../PairwiseScoreRepository";
import * as PointwiseHeuristicEvaluationScoreRepository from "../PointwiseHeuristicEvaluationScoreRepository";
import * as ScoreV2Repository from "../ScoreV2Repository";
import * as SxsEvaluationPairRepository from "../SxsEvaluationPairRepository";
import { type EvaluationDTO, create as newEvaluationDTO } from "../dto/EvaluationDTO";
import type { SXSPairEvaluationRequest } from "../dto/SXSPairEvaluationRequest";

type UserRef = { id: string | null };

/** Above this many messages Java used the "bulk" Pub/Sub topics (kept for logging only). */
const BULK_THRESHOLD = 10;

function requireEvaluatorIds(evaluatorIds: string[] | null | undefined): string[] {
  // The bulk endpoints do not validate evaluator_ids; Java failed on `evaluatorIds.contains`.
  if (evaluatorIds == null) {
    throw new RuntimeException('Cannot invoke "java.util.List.contains(Object)" because "evaluatorIds" is null');
  }
  return evaluatorIds;
}

export async function processProject(
  ctx: Ctx,
  chatTurnIds: string[],
  evaluatorIdsIn: string[] | null | undefined,
  containerId: string,
  user: UserRef,
): Promise<string> {
  const evaluatorIds = requireEvaluatorIds(evaluatorIdsIn);
  const llmEvaluators = await findLLMEvaluators(ctx, evaluatorIds, user);
  const heuristicEvaluators = await findHeuristicEvaluators(ctx, evaluatorIds, user);
  validateEvaluators(evaluatorIds, new Set(llmEvaluators.keys()), new Set(heuristicEvaluators.keys()), null);

  const filteredIds = await filterChatTurnIdsWithOutput(ctx, chatTurnIds);
  const total = filteredIds.length * (llmEvaluators.size + heuristicEvaluators.size);
  const jobStatus = await createJobStatus(ctx, await containerRef(ctx, containerId), total, user);
  await processBatch(ctx, filteredIds, llmEvaluators, heuristicEvaluators, jobStatus, user, containerId);
  return jobStatus.id as string;
}

export async function processDataSet(
  _ctx: Ctx,
  _chatTurnIds: string[],
  _evaluatorIds: string[] | null | undefined,
  _dataSetId: string,
  _user: UserRef,
): Promise<string> {
  throw new NotImplementedException("Evaluation on data sets is not supported yet");
}

export async function processChatTurns(
  ctx: Ctx,
  chatTurnIds: string[],
  evaluatorIdsIn: string[] | null | undefined,
  user: UserRef,
): Promise<string> {
  const evaluatorIds = requireEvaluatorIds(evaluatorIdsIn);
  const llmEvaluators = await findLLMEvaluators(ctx, evaluatorIds, user);
  const heuristicEvaluators = await findHeuristicEvaluators(ctx, evaluatorIds, user);
  validateEvaluators(evaluatorIds, new Set(llmEvaluators.keys()), new Set(heuristicEvaluators.keys()), null);

  const filteredIds = await filterChatTurnIdsWithOutput(ctx, chatTurnIds);
  const total = filteredIds.length * (llmEvaluators.size + heuristicEvaluators.size);
  const chatTurn = await ChatTurnRepository.findByIdAndUser(ctx.db, filteredIds[0], user.id as string);
  const chat = chatTurn?.chatId ? await ChatRepository.findById(ctx.db, chatTurn.chatId) : null;
  const project = await containerRef(ctx, chat?.containerId as string);

  const jobStatus = await createJobStatus(ctx, project, total, user);
  await processBatch(ctx, filteredIds, llmEvaluators, heuristicEvaluators, jobStatus, user, project.id as string);
  return jobStatus.id as string;
}

/** Pointwise evaluation of chat turns (and of both sides of SxS pairs) plus pairwise evaluation of pairs. */
export async function processLists(
  ctx: Ctx,
  sxsPairIds: SXSPairEvaluationRequest[] | null,
  chatTurnIdsIn: string[] | null,
  evaluatorIdsIn: string[] | null | undefined,
  containerId: string,
  user: UserRef,
): Promise<string> {
  const evaluatorIds = requireEvaluatorIds(evaluatorIdsIn);
  const llmEvals = await findLLMEvaluators(ctx, evaluatorIds, user);
  const heuristicEvals = await findHeuristicEvaluators(ctx, evaluatorIds, user);
  const pairwiseEvals = await findPairwiseEvaluators(ctx, evaluatorIds, user);
  validateEvaluators(evaluatorIds, new Set(llmEvals.keys()), new Set(heuristicEvals.keys()), new Set(pairwiseEvals.keys()));

  const chatTurnIdsSet = new Set(chatTurnIdsIn ?? []);
  let filteredSxsPairList: SXSPairEvaluationRequest[] = [];
  let totalSxs = 0;
  if (sxsPairIds?.length) {
    filteredSxsPairList = await filterSXSPairIdsWithOutput(ctx, sxsPairIds, user);
    totalSxs += filteredSxsPairList.length * pairwiseEvals.size;
    for (const id of getTurnIdsFromSxsPairs(sxsPairIds)) chatTurnIdsSet.add(id);
  }

  let filteredIds: string[] = [];
  let totalPointwise = 0;
  if (chatTurnIdsSet.size) {
    filteredIds = await filterChatTurnIdsWithOutput(ctx, [...chatTurnIdsSet]);
    totalPointwise += filteredIds.length * heuristicEvals.size + filteredIds.length * llmEvals.size;
  }

  if (totalPointwise + totalSxs === 0) {
    throw new IllegalInputException("No chat turns or SxS pairs available for evaluation");
  }

  const project = await containerRef(ctx, containerId);
  const jobStatus = await createJobStatus(ctx, project, totalSxs + totalPointwise, user);
  if (totalPointwise > 0) {
    await processBatch(ctx, filteredIds, llmEvals, heuristicEvals, jobStatus, user, containerId);
  }
  if (totalSxs > 0 && pairwiseEvals.size) {
    await processSxsBatch(ctx, filteredSxsPairList, pairwiseEvals, jobStatus, user, containerId);
  }
  return jobStatus.id as string;
}

// ---------------------------------------------------------------------------------------------

/** `entityManager.getReference(Project.class, id)`: the container row when it exists. */
async function containerRef(ctx: Ctx, containerId: string): Promise<EvaluationContainer> {
  return (
    (await EvaluationContainerRepository.findById(ctx.db, containerId)) ??
    ({ id: containerId } as unknown as EvaluationContainer)
  );
}

async function filterSXSPairIdsWithOutput(
  ctx: Ctx,
  sxsPairIds: SXSPairEvaluationRequest[],
  user: UserRef,
): Promise<SXSPairEvaluationRequest[]> {
  const pairIdsWithoutExplicitChatTurn = sxsPairIds
    .filter((p) => p.chat_turn_id_a == null || p.chat_turn_id_b == null)
    .map((p) => p.id);
  const filtered = [
    ...(await SxsEvaluationPairRepository.findPairsWithOutputOnBothSides(ctx.db, pairIdsWithoutExplicitChatTurn, user.id as string)),
  ];
  const explicitChatTurnIds = getTurnIdsFromSxsPairs(sxsPairIds);
  const withOutput = new Set(explicitChatTurnIds.length ? await filterChatTurnIdsWithOutput(ctx, explicitChatTurnIds) : []);
  for (const p of sxsPairIds) {
    if (p.chat_turn_id_a != null && p.chat_turn_id_b != null && withOutput.has(p.chat_turn_id_a) && withOutput.has(p.chat_turn_id_b)) {
      filtered.push(p);
    }
  }
  return filtered;
}

function getTurnIdsFromSxsPairs(pairs: SXSPairEvaluationRequest[]): string[] {
  return pairs
    .filter((p) => p.chat_turn_id_a != null && p.chat_turn_id_b != null)
    .flatMap((p) => [p.chat_turn_id_a as string, p.chat_turn_id_b as string]);
}

async function findLLMEvaluators(ctx: Ctx, evaluatorIds: string[], user: UserRef): Promise<Map<string, LLMEvaluator>> {
  const all = await LLMEvaluatorRepository.findAllByUserOrType(ctx.db, user.id, ScopeType.SYSTEM);
  return new Map(all.filter((e) => evaluatorIds.includes(e.id as string)).map((e) => [e.id as string, e]));
}

async function findHeuristicEvaluators(
  ctx: Ctx,
  evaluatorIds: string[],
  user: UserRef,
): Promise<Map<string, PointwiseHeuristicEvaluator>> {
  const all = await PointwiseHeuristicEvaluatorRepository.findAllByUser(ctx.db, user.id);
  return new Map(all.filter((e) => evaluatorIds.includes(e.id as string)).map((e) => [e.id as string, e]));
}

async function findPairwiseEvaluators(
  ctx: Ctx,
  evaluatorIds: string[],
  user: UserRef,
): Promise<Map<string, PairwiseLLMEvaluator>> {
  const all = await PairwiseLLMEvaluatorService.getAllPairwiseLLMEvaluators(ctx, user);
  return new Map(all.filter((e) => evaluatorIds.includes(e.id as string)).map((e) => [e.id as string, e]));
}

/**
 * Fails when fewer evaluators were found than requested. As in Java, the reported list is empty
 * unless all three sets were given (the null-set filters drop every id).
 */
function validateEvaluators(
  evaluatorIds: string[],
  llm: Set<string> | null,
  heuristic: Set<string> | null,
  pairwise: Set<string> | null,
): void {
  const count = (llm?.size ?? 0) + (heuristic?.size ?? 0) + (pairwise?.size ?? 0);
  if (count < evaluatorIds.length) {
    const invalid = evaluatorIds.filter(
      (id) => llm != null && !llm.has(id) && heuristic != null && !heuristic.has(id) && pairwise != null && !pairwise.has(id),
    );
    throw new IllegalInputException(`Invalid evaluator(s) provided: [${invalid.join(", ")}]`);
  }
}

async function filterChatTurnIdsWithOutput(ctx: Ctx, chatTurnIds: string[]): Promise<string[]> {
  const filtered = await ChatTurnRepository.findIdsWithNonEmptyModelResponse(ctx.db, chatTurnIds);
  if (!filtered.length) throw new IllegalInputException("No chat turns available for evaluation");
  return filtered;
}

async function createJobStatus(ctx: Ctx, project: EvaluationContainer, total: number, user: UserRef): Promise<JobStatus> {
  return JobStatusService.createScorerJobStatus(ctx, EVAL, null, user, JobStatusEnum.PENDING, total, project);
}

/** Saves statuses and the rows that reference them in D1 batches (statuses first in each batch). */
async function saveInBatches(ctx: Ctx, stmts: D1PreparedStatement[]): Promise<void> {
  for (const part of chunk(stmts, 50)) await ctx.db.batch(part);
}

async function processBatch(
  ctx: Ctx,
  chatTurnIds: string[],
  llmEvaluators: Map<string, LLMEvaluator>,
  heuristicEvaluators: Map<string, PointwiseHeuristicEvaluator>,
  jobStatus: JobStatus,
  user: UserRef,
  containerId: string,
): Promise<void> {
  const evaluatorIds = [...llmEvaluators.keys(), ...heuristicEvaluators.keys()];

  // Existing statuses of (turn, evaluator): re-attached to this job and reset to PENDING.
  const existing = await EvaluationStatusRepository.findByTurnAndEvaluatorLists(ctx.db, chatTurnIds, evaluatorIds, user.id as string);
  for (const s of existing) {
    s.jobId = jobStatus.id;
    s.status = getKey(EvaluationStatusEnum.PENDING);
  }
  await EvaluationStatusRepository.saveAll(ctx.db, existing);
  const existingKeys = new Set(existing.map((s) => `${s.chatTurnId}-${s.evaluatorId}`));

  // New statuses, each with a pre-created score row of the evaluator's kind.
  const newStatuses: EvaluationStatus[] = [];
  for (const chatTurnId of chatTurnIds) {
    for (const evaluatorId of evaluatorIds) {
      if (existingKeys.has(`${chatTurnId}-${evaluatorId}`)) continue;
      newStatuses.push(
        EvaluationStatusEntity.create({
          chatTurnId,
          evaluatorId,
          userId: user.id,
          jobId: jobStatus.id,
          status: getKey(EvaluationStatusEnum.PENDING),
          containerId,
        }),
      );
    }
  }
  if (newStatuses.length) await createNewScores(ctx, newStatuses, llmEvaluators, heuristicEvaluators, user);

  const dtos = [...existing, ...newStatuses].map((s) =>
    newEvaluationDTO({
      chatTurnId: s.chatTurnId,
      evaluatorId: s.evaluatorId,
      jobId: s.jobId,
      evaluationStatusId: s.id,
      userId: user.id,
      containerId,
    }),
  );
  const llmDTOs = dtos.filter((d) => llmEvaluators.has(d.evaluatorId as string));
  const heuristicDTOs = dtos.filter((d) => heuristicEvaluators.has(d.evaluatorId as string));
  console.log(
    `Sending ${llmDTOs.length} LLM and ${heuristicDTOs.length} heuristic evaluations to the queue (bulk: ${dtos.length > BULK_THRESHOLD}).`,
  );
  await LLMScoreQueueService.sendAllToQueue(ctx, llmDTOs);
  await PointwiseHeuristicEvaluationScoreQueueService.sendAllToQueue(ctx, heuristicDTOs);
}

async function createNewScores(
  ctx: Ctx,
  newStatuses: EvaluationStatus[],
  llmEvaluators: Map<string, LLMEvaluator>,
  heuristicEvaluators: Map<string, PointwiseHeuristicEvaluator>,
  user: UserRef,
): Promise<void> {
  const turns = await ChatTurnRepository.findAllById(ctx.db, [...new Set(newStatuses.map((s) => s.chatTurnId as string))]);
  const responseByTurn = new Map(turns.map((t) => [t.id, t.modelResponseId]));
  const stmts: D1PreparedStatement[] = [];
  for (const status of newStatuses) {
    stmts.push(EvaluationStatusRepository.saveStmt(ctx.db, status));
    const modelResponseId = responseByTurn.get(status.chatTurnId) ?? null;
    const llm = llmEvaluators.get(status.evaluatorId as string);
    const heuristic = heuristicEvaluators.get(status.evaluatorId as string);
    if (llm) {
      stmts.push(
        ScoreV2Repository.saveStmt(
          ctx.db,
          ScoreV2Entity.create({
            modelResponseId,
            evaluationStatusId: status.id,
            userId: user.id,
            llmEvaluatorId: llm.id,
            scorer: llm.name,
            scoreType: llm.outputFormatType,
          }),
        ),
      );
    } else if (heuristic) {
      stmts.push(
        PointwiseHeuristicEvaluationScoreRepository.saveStmt(
          ctx.db,
          PointwiseHeuristicEvaluationScoreEntity.create({
            modelResponseId,
            evaluationStatusId: status.id,
            pointwiseEvaluatorId: heuristic.id,
            userId: user.id,
          }),
        ),
      );
    }
  }
  await saveInBatches(ctx, stmts);
}

async function processSxsBatch(
  ctx: Ctx,
  pairs: SXSPairEvaluationRequest[],
  pairwiseEvals: Map<string, PairwiseLLMEvaluator>,
  jobStatus: JobStatus,
  user: UserRef,
  containerId: string,
): Promise<void> {
  const scores = await processSxsScores(ctx, pairs, [...pairwiseEvals.keys()], jobStatus, user);
  const dtos = scores.map((s) =>
    newEvaluationDTO({
      chatTurnId: s.chatTurnAId,
      chatturnIdB: s.chatTurnBId,
      pairId: s.pairId,
      evaluatorId: s.llmEvaluatorId,
      jobId: jobStatus.id,
      evaluationStatusId: s.evaluationStatusId,
      userId: user.id,
      containerId,
    }),
  );
  console.log(`Sending ${dtos.length} pairwise evaluations to the queue (bulk: ${dtos.length > BULK_THRESHOLD}).`);
  await LLMScoreQueueService.sendAllToQueue(ctx, dtos);
}

/** Returns the pair scores to evaluate (existing ones re-attached to the job, new ones created). */
async function processSxsScores(
  ctx: Ctx,
  pairs: SXSPairEvaluationRequest[],
  evaluators: string[],
  jobStatus: JobStatus,
  user: UserRef,
): Promise<PairwiseScore[]> {
  const existingScores = await PairwiseScoreRepository.findEvaluationStatusByPairDetailsAndEvaluators(
    ctx.db,
    pairs.map((p) => p.id),
    pairs.map((p) => p.chat_turn_id_a as string),
    pairs.map((p) => p.chat_turn_id_b as string),
    evaluators,
    user.id as string,
  );
  const statusIds = existingScores.map((s) => s.evaluationStatusId).filter((x): x is string => !!x);
  const statusById = new Map(
    (await allIn(ctx.db, (inC) => `SELECT * FROM evaluation_status WHERE id IN ${inC}`, statusIds))
      .map(EvaluationStatusEntity.fromRow)
      .map((s) => [s.id, s] as const),
  );

  const stmts: D1PreparedStatement[] = [];
  const touched = new Set<string>();
  const newScores: PairwiseScore[] = [];
  for (const pair of pairs) {
    for (const evaluator of evaluators) {
      const existing = existingScores.find(
        (s) =>
          pair.id === s.pairId &&
          pair.chat_turn_id_a === s.chatTurnAId &&
          pair.chat_turn_id_b === s.chatTurnBId &&
          evaluator === s.llmEvaluatorId,
      );
      const existingStatus = existing?.evaluationStatusId ? statusById.get(existing.evaluationStatusId) : undefined;
      if (!existing || !existingStatus) {
        const status = EvaluationStatusEntity.create({
          userId: user.id,
          jobId: jobStatus.id,
          evaluatorId: evaluator,
          status: getKey(EvaluationStatusEnum.PENDING),
          containerId: jobStatus.projectId,
          chatTurnId: pair.chat_turn_id_a,
        });
        stmts.push(EvaluationStatusRepository.saveStmt(ctx.db, status));
        const score = PairwiseScoreEntity.create({
          pairId: pair.id,
          chatTurnAId: pair.chat_turn_id_a,
          chatTurnBId: pair.chat_turn_id_b,
          llmEvaluatorId: evaluator,
          userId: user.id,
          evaluationStatusId: status.id,
        });
        stmts.push(PairwiseScoreRepository.saveStmt(ctx.db, score));
        newScores.push(score);
      } else {
        existingStatus.jobId = jobStatus.id;
        existingStatus.status = getKey(EvaluationStatusEnum.PENDING);
        if (!touched.has(existingStatus.id as string)) {
          touched.add(existingStatus.id as string);
          stmts.push(EvaluationStatusRepository.saveStmt(ctx.db, existingStatus));
        }
      }
    }
  }
  await saveInBatches(ctx, stmts);
  return [...existingScores, ...newScores];
}
