/**
 * Port of domain/evaluation/SXSHumanFeedbackService(+Impl).
 * `request` is project/dto/SXSHumanFeedbackRequestDTO (JSON: notes, rating, chat_turn_a_id,
 * chat_turn_b_id); `rows` are SXSChatRowDTO JSON objects (id, chat_turn_a.chat_turn_id, ...),
 * mutated in place like the Java DTOs.
 */
import type { Ctx } from "../../lib/ctx";
import { IllegalInputException, NotFoundException } from "../../lib/errors";
import type { ChatTurn } from "../../entities/ChatTurn";
import * as SXSHumanFeedbackEntity from "../../entities/SXSHumanFeedback";
import type { SXSHumanFeedback } from "../../entities/SXSHumanFeedback";
import type { SxsEvaluationPair } from "../../entities/SxsEvaluationPair";
import type { HumanSxsRating } from "../../enums/HumanSxsRating";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import * as ModelResponseRepository from "../modelresponse/ModelResponseRepository";
import * as SXSHumanFeedbackRepository from "./SXSHumanFeedbackRepository";
import * as SxsEvaluationPairRepository from "./SxsEvaluationPairRepository";

type UserRef = { id: string | null };

/** Structural view of project/dto/SXSHumanFeedbackRequestDTO. */
export interface SXSHumanFeedbackRequest {
  notes?: string | null;
  rating?: HumanSxsRating | null;
  chat_turn_a_id?: string | null;
  chat_turn_b_id?: string | null;
}

/** Structural view of the SXSChatRowDTO fields read / written here. */
export interface SXSChatRowLike {
  id?: string | null;
  chat_turn_a?: { chat_turn_id?: string | null } | null;
  chat_turn_b?: { chat_turn_id?: string | null } | null;
  human_sxs_rating?: HumanSxsRating | null;
  human_sxs_notes?: string | null;
}

export async function getSxsPairById(ctx: Ctx, pairId: string, user: UserRef): Promise<SxsEvaluationPair> {
  const pair = await SxsEvaluationPairRepository.findByIdAndUser(ctx.db, pairId, user.id as string);
  if (!pair) throw new NotFoundException(`SxsEvaluationPair not found with id: ${pairId}`);
  return pair;
}

/** Chat.getLatestTurn(): the chat's turn with the highest sequence id. */
async function latestTurn(ctx: Ctx, chatId: string): Promise<ChatTurn | null> {
  const turns = await ChatTurnRepository.findByChatIn(ctx.db, [chatId]);
  turns.sort((a, b) => (a.sequenceId ?? 0) - (b.sequenceId ?? 0));
  return turns.length ? turns[turns.length - 1] : null;
}

/**
 * Creates, updates or (when both rating and notes are null) deletes the feedback for the pair's
 * given turns, or for the latest turns of both sides. Returns null after a delete.
 */
export async function submitHumanFeedback(
  ctx: Ctx,
  user: UserRef,
  _projectId: string,
  pairId: string,
  request: SXSHumanFeedbackRequest,
): Promise<SXSHumanFeedback | null> {
  const pair = await getSxsPairById(ctx, pairId, user);
  if (pair.chatAId == null || pair.chatBId == null) {
    throw new IllegalInputException("Cannot submit human feedback because Side A or Side B is missing.");
  }
  validateHumanFeedbackRequest(request);

  let chatTurnA: ChatTurn | null;
  let chatTurnB: ChatTurn | null;
  if (request.chat_turn_a_id != null && request.chat_turn_b_id != null) {
    chatTurnA = await ChatTurnRepository.findByIdAndUser(ctx.db, request.chat_turn_a_id, user.id as string);
    chatTurnB = await ChatTurnRepository.findByIdAndUser(ctx.db, request.chat_turn_b_id, user.id as string);
  } else {
    chatTurnA = await latestTurn(ctx, pair.chatAId);
    chatTurnB = await latestTurn(ctx, pair.chatBId);
  }
  await validateTurnsForHumanFeedback(ctx, chatTurnA, chatTurnB);
  const a = chatTurnA as ChatTurn;
  const b = chatTurnB as ChatTurn;

  if (request.notes == null && request.rating == null) {
    await SXSHumanFeedbackRepository.deleteByPairIdAndChatTurns(ctx.db, pair.id as string, a.id as string, b.id as string);
    return null;
  }

  const existing = await SXSHumanFeedbackRepository.findByPairIdAndChatTurns(ctx.db, pair.id as string, a.id as string, b.id as string);
  const feedback =
    existing ??
    SXSHumanFeedbackEntity.create({
      pairId: pair.id,
      chatTurnA: a.id,
      chatTurnB: b.id,
      userId: user.id,
      projectId: pair.containerId,
    });
  feedback.humanSxsRating = request.rating ?? null;
  feedback.humanSxsNotes = request.notes ?? null;
  return SXSHumanFeedbackRepository.save(ctx.db, feedback);
}

export async function deleteHumanFeedback(ctx: Ctx, user: UserRef, _projectId: string, pairId: string): Promise<void> {
  const pair = await getSxsPairById(ctx, pairId, user);
  await SXSHumanFeedbackRepository.deleteByPairId(ctx.db, pair.id as string);
}

/** No ownership check (as in Java). */
export async function deleteHumanFeedbackForChatTurn(
  ctx: Ctx,
  _user: UserRef,
  _projectId: string,
  _pairId: string,
  chatTurnA: string,
  chatTurnB: string,
): Promise<void> {
  await SXSHumanFeedbackRepository.deleteByChatTurnAAndChatTurnB(ctx.db, chatTurnA, chatTurnB);
}

/** The most recently created feedback of the pair, or null. */
export async function getHumanFeedback(ctx: Ctx, _user: UserRef, pairId: string): Promise<SXSHumanFeedback | null> {
  const list = await SXSHumanFeedbackRepository.findByPairId(ctx.db, pairId);
  list.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  return list[0] ?? null;
}

const feedbackKey = (pairId: unknown, a: unknown, b: unknown) => `${pairId ?? "null"}|${a ?? "null"}|${b ?? "null"}`;

/** Copies the stored rating/notes onto the rows whose (pair, turn A, turn B) match. */
export async function setHumanFeedbackForSxsRows(ctx: Ctx, rows: SXSChatRowLike[] | null, _user: UserRef): Promise<void> {
  if (!rows || !rows.length) return;
  const feedbacks = await SXSHumanFeedbackRepository.findByPairIds(
    ctx.db,
    rows.map((r) => r.id as string),
  );
  const map = new Map<string, SXSHumanFeedback>();
  for (const f of feedbacks) {
    const k = feedbackKey(f.pairId, f.chatTurnA, f.chatTurnB);
    // Collectors.toMap failed on duplicate keys.
    if (map.has(k)) throw new Error(`Duplicate key ${k}`);
    map.set(k, f);
  }
  for (const row of rows) {
    const f = map.get(feedbackKey(row.id, row.chat_turn_a?.chat_turn_id, row.chat_turn_b?.chat_turn_id));
    if (f) {
      row.human_sxs_rating = f.humanSxsRating;
      row.human_sxs_notes = f.humanSxsNotes;
    }
  }
}

export async function getHumanEvalMetricsByProject(ctx: Ctx, projectId: string, user: UserRef) {
  return SXSHumanFeedbackRepository.getHumanEvalMetricsByProject(ctx.db, projectId, user.id as string);
}

async function validateTurnsForHumanFeedback(ctx: Ctx, a: ChatTurn | null, b: ChatTurn | null): Promise<void> {
  if (!a || !b) throw new NotFoundException("One of the chat turns could not be retrieved");
  const [ra, rb] = await Promise.all([
    a.modelResponseId ? ModelResponseRepository.findById(ctx.db, a.modelResponseId) : null,
    b.modelResponseId ? ModelResponseRepository.findById(ctx.db, b.modelResponseId) : null,
  ]);
  if (!ra || !rb || !ra.text?.trim() || !rb.text?.trim()) {
    throw new IllegalInputException("Cannot submit human feedback because Side A or Side B does not have a response");
  }
}

function validateHumanFeedbackRequest(request: SXSHumanFeedbackRequest): void {
  const hasA = request.chat_turn_a_id != null && request.chat_turn_a_id.trim() !== "";
  const hasB = request.chat_turn_b_id != null && request.chat_turn_b_id.trim() !== "";
  if (hasA !== hasB) {
    throw new IllegalInputException("Either both chatTurnA and chatTurnB must be provided, or neither should be provided.");
  }
}
