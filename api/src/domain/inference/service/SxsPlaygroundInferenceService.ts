/**
 * Port of domain/inference/service/SxsPlaygroundInferenceService(+Impl). Both functions return
 * the saved SxsEvaluationPair entity (the SXS controller maps it to its DTO).
 *
 * Workers: no transaction, so a failure on side B does not roll back side A's new turns.
 */
import type { Ctx } from "../../../lib/ctx";
import { IllegalArgumentException, IllegalInputException, IllegalStateException, NotFoundException, RuntimeException } from "../../../lib/errors";
import type { ChatTurn } from "../../../entities/ChatTurn";
import * as SxsEvaluationPairEntity from "../../../entities/SxsEvaluationPair";
import type { SxsEvaluationPair } from "../../../entities/SxsEvaluationPair";
import type { User } from "../../../entities/User";
import { EvaluationType } from "../../../enums/EvaluationType";
import { InputRole } from "../../../enums/InputRole";
import type { Prompt } from "../../../llmproviders/dto/Prompt";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import type { ChatTurnDTO } from "../../chatturn/dto/ChatTurnDTO";
import * as SxsEvaluationPairRepository from "../../evaluation/SxsEvaluationPairRepository";
import * as ProjectRepository from "../../project/ProjectRepository";
import * as SxsEvaluationPairService from "../../project/SxsEvaluationPairService";
import type { ContinueSxsRequestDTO } from "../dto/ContinueSxsRequestDTO";
import { type LoadedChatTurn, loadChatTurn, loadChatTurns } from "./ChatTurnGraph";
import * as PlaygroundInferenceService from "./PlaygroundInferenceService";

/** Fields of domain/project/dto/SxsInferenceRequestDTO used here (JSON names, SnakeCase). */
export interface SxsInferenceRequest {
  model_id_a?: string | null;
  model_id_b?: string | null;
  model_a_instruction?: string | null;
  model_b_instruction?: string | null;
  prompts?: Prompt[] | null;
  expected_output?: string | null;
  variables?: Record<string, string> | null;
}

function isBlank(s: string | null | undefined): boolean {
  return s == null || s.trim() === "";
}

function dtoId(dto: ChatTurnDTO): string {
  return (dto as unknown as Record<string, unknown>).chat_turn_id as string;
}

/** `chatTurnRepository.findById(id).orElseThrow()` (NoSuchElementException → 500). */
async function findTurnOrThrow(ctx: Ctx, id: string): Promise<ChatTurn> {
  const t = await ChatTurnRepository.findById(ctx.db, id);
  if (!t) throw new RuntimeException("No value present");
  return t;
}

export async function runInitialSxsInference(
  ctx: Ctx,
  user: User,
  projectId: string,
  request: SxsInferenceRequest,
): Promise<SxsEvaluationPair> {
  const project = await ProjectRepository.findByUserAndId(ctx.db, user.id as string, projectId);
  if (!project) throw new NotFoundException(`Project not found: ${projectId}`);
  if (project.evaluationType !== EvaluationType.SXS) {
    throw new IllegalInputException("This inference is only supported for SxS projects.");
  }

  const promptsA = getPromptsForSide(request.prompts ?? null, request.model_a_instruction ?? null);
  const finalTurnADto = await PlaygroundInferenceService.runInferenceWithConversation(
    ctx,
    user,
    projectId,
    request.model_id_a as string,
    null,
    promptsA,
    request.variables ?? null,
  );
  const finalTurnA = await findTurnOrThrow(ctx, dtoId(finalTurnADto));

  const pair = SxsEvaluationPairEntity.create({
    containerId: project.id,
    userId: user.id,
    chatAId: finalTurnA.chatId,
    chatTurnAId: finalTurnA.id,
    expectedOutput: request.expected_output ?? null,
    variables: request.variables != null ? { ...request.variables } : null,
  });

  if (!isBlank(request.model_id_b)) {
    const promptsB = getPromptsForSide(request.prompts ?? null, request.model_b_instruction ?? null);
    const finalTurnBDto = await PlaygroundInferenceService.runInferenceWithConversation(
      ctx,
      user,
      projectId,
      request.model_id_b as string,
      null,
      promptsB,
      request.variables ?? null,
    );
    const finalTurnB = await findTurnOrThrow(ctx, dtoId(finalTurnBDto));
    pair.chatBId = finalTurnB.chatId;
    pair.chatTurnBId = finalTurnB.id;
  }

  return SxsEvaluationPairRepository.save(ctx.db, pair);
}

export async function continueSxsEvaluation(
  ctx: Ctx,
  user: User,
  projectId: string,
  pairId: string,
  request: ContinueSxsRequestDTO,
): Promise<SxsEvaluationPair> {
  let pair = await findSxsPairOrThrow(ctx, pairId, user);

  pair = await handlePairSynchronization(ctx, pair, user, request);
  pair = await ensureSideBIsReady(ctx, pair, user, projectId, request);
  try {
    await runNewInferenceTurns(ctx, pair, user, projectId, request);
  } catch (e) {
    // No rollback on D1: keep the pair pointing at the latest turns the synchronization created,
    // otherwise it drops out of the workbook (which only lists pairs on their chats' latest turns).
    await SxsEvaluationPairRepository.save(ctx.db, pair);
    throw e;
  }

  return SxsEvaluationPairRepository.save(ctx.db, pair);
}

async function findSxsPairOrThrow(ctx: Ctx, pairId: string, user: User): Promise<SxsEvaluationPair> {
  const pair = await SxsEvaluationPairRepository.findByIdAndUser(ctx.db, pairId, user.id as string);
  if (!pair) throw new NotFoundException(`SxS Pair not found: ${pairId}`);
  return pair;
}

async function handlePairSynchronization(
  ctx: Ctx,
  pair: SxsEvaluationPair,
  user: User,
  request: ContinueSxsRequestDTO,
): Promise<SxsEvaluationPair> {
  const bothSidesExist = pair.chatTurnAId != null && pair.chatTurnBId != null;
  if (bothSidesExist && !(await shouldSkipSynchronization(ctx, pair, request))) {
    // Mutates (and returns) the pair without saving it, like the Java service.
    const synced = await SxsEvaluationPairService.synchronizeSxsPairChats(
      ctx,
      pair,
      user,
      request.model_id_a ?? null,
      request.model_id_b ?? null,
    );
    return synced ?? pair;
  }
  return pair;
}

async function ensureSideBIsReady(
  ctx: Ctx,
  pair: SxsEvaluationPair,
  user: User,
  projectId: string,
  request: ContinueSxsRequestDTO,
): Promise<SxsEvaluationPair> {
  const sideBNeedsGeneration = pair.chatTurnBId == null && !isBlank(request.model_id_b);
  if (!sideBNeedsGeneration) return pair;
  await SxsEvaluationPairService.generateAndSetTurnB(ctx, user, projectId, pair.id as string, request.model_id_b as string, false);
  // Java saw the change on the same managed entity; reload the saved pair.
  return findSxsPairOrThrow(ctx, pair.id as string, user);
}

async function runNewInferenceTurns(
  ctx: Ctx,
  pair: SxsEvaluationPair,
  user: User,
  projectId: string,
  request: ContinueSxsRequestDTO,
): Promise<void> {
  const prompts = request.prompts ?? null;
  const turnA = pair.chatTurnAId ? await loadChatTurn(ctx.db, await findTurnOrThrow(ctx, pair.chatTurnAId)) : null;
  const turnB = pair.chatTurnBId ? await loadChatTurn(ctx.db, await findTurnOrThrow(ctx, pair.chatTurnBId)) : null;
  // Java ran this in one @Transactional, so a model conflict on side B rolled back side A's new
  // turn. D1 has no rollback: resolve (and validate) both sides' models before running anything.
  const modelIdA = resolveModelIdForSide(turnA, request.model_id_a ?? null);
  if (modelIdA == null) {
    throw new IllegalStateException(
      "Cannot continue conversation: Model is required in the current response or should be provided in the request.",
    );
  }
  const modelIdB = resolveModelIdForSide(turnB, request.model_id_b ?? null);
  const newFinalTurnADto = await PlaygroundInferenceService.runInferenceWithConversation(
    ctx, user, projectId, modelIdA, (turnA as LoadedChatTurn).id, prompts, null,
  );
  const newFinalTurnBDto =
    modelIdB == null
      ? null
      : await PlaygroundInferenceService.runInferenceWithConversation(
          ctx, user, projectId, modelIdB, (turnB as LoadedChatTurn).id, prompts, null,
        );

  // updatePairWithNewTurns
  pair.chatTurnAId = (await findTurnOrThrow(ctx, dtoId(newFinalTurnADto))).id;
  if (newFinalTurnBDto != null) pair.chatTurnBId = (await findTurnOrThrow(ctx, dtoId(newFinalTurnBDto))).id;
}

/** Model to continue a side with (null: side skipped); runInferenceForSide's checks in Java. */
function resolveModelIdForSide(turn: LoadedChatTurn | null, requestModelId: string | null): string | null {
  if (turn == null) return null;
  if (turn.modelResponse != null && turn.modelResponse.model != null) {
    const existingModelId = turn.modelResponse.model.id as string;
    if (requestModelId != null && requestModelId !== existingModelId) {
      throw new IllegalArgumentException(
        `Model ID conflict. Turn already has model '${existingModelId}', but a different model '${requestModelId}' was requested.`,
      );
    }
    return existingModelId;
  }
  return requestModelId;
}

async function shouldSkipSynchronization(
  ctx: Ctx,
  pair: SxsEvaluationPair,
  request: ContinueSxsRequestDTO,
): Promise<boolean> {
  const noModelsInRequest = isBlank(request.model_id_a) && isBlank(request.model_id_b);
  if (!noModelsInRequest) return false;
  const [turnsA, turnsB] = await Promise.all([fullChatHistory(ctx, pair.chatTurnAId), fullChatHistory(ctx, pair.chatTurnBId)]);
  return isInitialEmptyState(turnsA) || isInitialEmptyState(turnsB);
}

/** chatService.getFullChatHistory(anyTurnInChat): the turn's chat (same container and user), by sequence. */
async function fullChatHistory(ctx: Ctx, turnId: string | null): Promise<LoadedChatTurn[]> {
  if (!turnId) return [];
  const turn = await ChatTurnRepository.findById(ctx.db, turnId);
  if (!turn) return [];
  const loaded = await loadChatTurn(ctx.db, turn);
  const rows = await ChatTurnRepository.findByChatIdAndContainerAndUserIdOrderBySequenceId(
    ctx.db,
    loaded.chatId as string,
    loaded.chat.containerId as string,
    loaded.userId as string,
  );
  return loadChatTurns(ctx.db, rows, { chats: [loaded.chat] });
}

function isInitialEmptyState(turns: LoadedChatTurn[]): boolean {
  if (turns.length !== 1) return false;
  const turn = turns[0];
  return turn.modelResponse == null || isBlank(turn.modelResponse.text);
}

function getPromptsForSide(prompts: Prompt[] | null, systemInstruction: string | null): Prompt[] | null {
  if (isBlank(systemInstruction)) return prompts;
  // This is only used for a new conversation, so we can always append the system instruction
  // as a first prompt. If the requirements change at some point, we can adapt the logic.
  if (prompts == null) throw new RuntimeException(`Cannot invoke "java.util.List.size()" because "prompts" is null`);
  return [{ role: InputRole.SYSTEM, text: systemInstruction }, ...prompts];
}
