/**
 * Port of domain/project/dto/SXSChatRowDTO: one SxS row (turn A vs turn B of a pair).
 *
 * `new SXSChatRowDTO(pair[, humanFeedback])` →
 * - `from(ctx, pair, humanFeedback?, user?)` (alias `fromPair`): loads the pair's turns / pairwise
 *   scores, builds the row and sets the tags of its chat turns (TagResponseEnrichmentAdvice; the
 *   tags of `user`, default the request user, else the pair's owner);
 * - `fromList(ctx, pairs, user?)`: same for a list of pairs, in bulk;
 * - `build(loadedPair, humanFeedback)`: synchronous build from a `LoadedSxsPair` (no tags), used
 *   for the "artificial" per-turn pairs of SxsEvaluationPairService.getSXSRowsForPair.
 * `applyRowTags(ctx, user, rows)` tags the chat_turn_a / chat_turn_b rows of already built rows.
 */
import type { Ctx } from "../../../lib/ctx";
import { allIn } from "../../../lib/db";
import * as ChatTurnEntity from "../../../entities/ChatTurn";
import type { SXSHumanFeedback } from "../../../entities/SXSHumanFeedback";
import type { SxsEvaluationPair } from "../../../entities/SxsEvaluationPair";
import type { HumanSxsRating } from "../../../enums/HumanSxsRating";
import type { LLMEvaluationDTO } from "../../evaluation/dto/LLMEvaluationDTO";
import type { PointwiseHeuristicEvaluationDTO } from "../../evaluation/dto/PointwiseHeuristicEvaluationDTO";
import {
  type LoadedChatTurn,
  type LoadedPairwiseScore,
  type Taggable,
  applyTags,
  heuristicScoresOf,
  llmScoresOf,
  loadChatTurns,
  loadPairwiseScoresByPairIds,
  pairwiseScoresOf,
} from "../../workbook/dto/BaseWorkbookRowDTO";
import * as SXSChatTurnWorkbookRowDTO from "./SXSChatTurnWorkbookRowDTO";
import * as SXSPointEvaluationDTO from "./SXSPointEvaluationDTO";
import * as SXSPointwiseHeuristicEvaluationDTO from "./SXSPointwiseHeuristicEvaluationDTO";

export interface SXSChatRowDTO {
  id: string | null;
  input: string | null;
  raw_input: string | null;
  expected_output: string | null;
  human_sxs_rating: HumanSxsRating | null;
  human_sxs_notes: string | null;
  chat_turn_a: SXSChatTurnWorkbookRowDTO.SXSChatTurnWorkbookRowDTO | null;
  chat_turn_b: SXSChatTurnWorkbookRowDTO.SXSChatTurnWorkbookRowDTO | null;
  point_evaluations: Record<string, SXSPointEvaluationDTO.SXSPointEvaluationDTO>;
  sxs_evaluations: Record<string, LLMEvaluationDTO>;
  point_heuristic_evaluations: Record<string, SXSPointwiseHeuristicEvaluationDTO.SXSPointwiseHeuristicEvaluationDTO>;
}

/** An SxsEvaluationPair with the relations the DTO reads. */
export interface LoadedSxsPair {
  id: string | null;
  expectedOutput: string | null;
  chatTurnA: LoadedChatTurn | null;
  chatTurnB: LoadedChatTurn | null;
  /** All pairwise scores of the pair (filtered to the row's turns when building). */
  pairwiseScores: LoadedPairwiseScore[];
}

/** Loads turn A / turn B (full graph) and the pairwise scores of the given pairs. Order preserved. */
export async function loadPairs(db: D1Database, pairs: SxsEvaluationPair[]): Promise<LoadedSxsPair[]> {
  if (!pairs.length) return [];
  const turnIds = [...new Set(pairs.flatMap((p) => [p.chatTurnAId, p.chatTurnBId]).filter((x): x is string => !!x))];
  const turns = (
    await allIn(db, (inn) => `SELECT * FROM "${ChatTurnEntity.TABLE}" WHERE id IN ${inn}`, turnIds)
  ).map(ChatTurnEntity.fromRow);
  const [loadedTurns, scores] = await Promise.all([
    loadChatTurns(db, turns),
    loadPairwiseScoresByPairIds(db, pairs.map((p) => p.id as string)),
  ]);
  const turnById = new Map(loadedTurns.map((t) => [t.id as string, t]));
  return pairs.map((p) => ({
    id: p.id,
    expectedOutput: p.expectedOutput,
    chatTurnA: (p.chatTurnAId && turnById.get(p.chatTurnAId)) || null,
    chatTurnB: (p.chatTurnBId && turnById.get(p.chatTurnBId)) || null,
    pairwiseScores: scores.get(p.id as string) ?? [],
  }));
}

function sideBySide<T, R>(
  a: Record<string, T>,
  b: Record<string, T>,
  combine: (a: T | null, b: T | null) => R,
): Record<string, R> {
  const out: Record<string, R> = {};
  const rest = { ...b };
  for (const [name, evalA] of Object.entries(a)) {
    const evalB = name in rest ? rest[name] : null;
    delete rest[name];
    out[name] = combine(evalA, evalB);
  }
  for (const [name, evalB] of Object.entries(rest)) out[name] = combine(null, evalB);
  return out;
}

function llmEvaluationsOf(turn: LoadedChatTurn | null): Record<string, LLMEvaluationDTO> {
  const scores = turn?.modelResponse?.scores;
  return scores && scores.length ? llmScoresOf(scores) : {};
}

function heuristicEvaluationsOf(turn: LoadedChatTurn | null): Record<string, PointwiseHeuristicEvaluationDTO> {
  const scores = turn?.modelResponse?.pointwiseHeuristicEvaluationScores;
  return scores && scores.length ? heuristicScoresOf(scores) : {};
}

export function build(pair: LoadedSxsPair, humanFeedback: SXSHumanFeedback | null = null): SXSChatRowDTO {
  const row: SXSChatRowDTO = {
    id: pair.id,
    input: null,
    raw_input: null,
    expected_output: pair.expectedOutput,
    human_sxs_rating: null,
    human_sxs_notes: null,
    chat_turn_a: null,
    chat_turn_b: null,
    point_evaluations: {},
    sxs_evaluations: {},
    point_heuristic_evaluations: {},
  };
  if (humanFeedback) {
    row.human_sxs_rating = humanFeedback.humanSxsRating;
    row.human_sxs_notes = humanFeedback.humanSxsNotes;
  }
  if (pair.chatTurnA) {
    row.raw_input = ChatTurnEntity.getRawInputText(pair.chatTurnA);
    row.input = ChatTurnEntity.getEnrichedInputText(pair.chatTurnA);
    row.chat_turn_a = SXSChatTurnWorkbookRowDTO.build(pair.chatTurnA);
  }
  if (pair.chatTurnB) row.chat_turn_b = SXSChatTurnWorkbookRowDTO.build(pair.chatTurnB);

  row.point_evaluations = sideBySide(
    llmEvaluationsOf(pair.chatTurnA),
    llmEvaluationsOf(pair.chatTurnB),
    SXSPointEvaluationDTO.create,
  );
  row.point_heuristic_evaluations = sideBySide(
    heuristicEvaluationsOf(pair.chatTurnA),
    heuristicEvaluationsOf(pair.chatTurnB),
    SXSPointwiseHeuristicEvaluationDTO.create,
  );
  if (pair.pairwiseScores.length) {
    row.sxs_evaluations = pairwiseScoresOf(pair.pairwiseScores, pair.chatTurnA, pair.chatTurnB);
  }
  return row;
}

type UserRef = { id: string | null };

/** Sets the tags of every chat_turn_a / chat_turn_b of the rows. */
export async function applyRowTags(ctx: Ctx, user: UserRef, rows: SXSChatRowDTO[]): Promise<void> {
  const taggables: Taggable[] = [];
  for (const r of rows) {
    if (r.chat_turn_a) taggables.push(r.chat_turn_a);
    if (r.chat_turn_b) taggables.push(r.chat_turn_b);
  }
  await applyTags(ctx, user, taggables);
}

export async function fromList(ctx: Ctx, pairs: SxsEvaluationPair[], user?: UserRef): Promise<SXSChatRowDTO[]> {
  const rows = (await loadPairs(ctx.db, pairs)).map((p) => build(p, null));
  await applyRowTags(ctx, user ?? ctx.user ?? { id: pairs[0]?.userId ?? null }, rows);
  return rows;
}

export async function from(
  ctx: Ctx,
  pair: SxsEvaluationPair,
  humanFeedback: SXSHumanFeedback | null = null,
  user?: UserRef,
): Promise<SXSChatRowDTO> {
  const [loaded] = await loadPairs(ctx.db, [pair]);
  const row = build(loaded, humanFeedback);
  await applyRowTags(ctx, user ?? ctx.user ?? { id: pair.userId }, [row]);
  return row;
}

export const fromPair = from;
