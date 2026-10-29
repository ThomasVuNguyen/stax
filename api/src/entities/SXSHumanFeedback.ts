import { newId } from "../lib/db";
import type { HumanSxsRating } from "../enums/HumanSxsRating";
import * as HumanSxsRatingConverter from "../util/converter/HumanSxsRatingConverter";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "sxs_human_feedback";
export const ID_PREFIX = "sxs-human-eval-";

export interface SXSHumanFeedback {
  id: string | null;
  pairId: string | null;
  projectId: string | null;
  /** plain String column chat_turn_a (a chat turn id) */
  chatTurnA: string | null;
  /** plain String column chat_turn_b (a chat turn id) */
  chatTurnB: string | null;
  humanSxsRating: HumanSxsRating | null;
  humanSxsNotes: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const COLUMNS: Record<keyof SXSHumanFeedback, string> = {
  id: "id",
  pairId: "pair_id",
  projectId: "project_id",
  chatTurnA: "chat_turn_a",
  chatTurnB: "chat_turn_b",
  humanSxsRating: "human_sxs_rating",
  humanSxsNotes: "human_sxs_notes",
  userId: "user_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function create(init: Partial<SXSHumanFeedback> = {}): SXSHumanFeedback {
  return {
    id: null,
    pairId: null,
    projectId: null,
    chatTurnA: null,
    chatTurnB: null,
    humanSxsRating: null,
    humanSxsNotes: null,
    userId: null,
    createdAt: null,
    updatedAt: null,
    ...init,
  };
}

export function prePersist(e: SXSHumanFeedback): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): SXSHumanFeedback {
  return {
    id: str(row.id),
    pairId: str(row.pair_id),
    projectId: str(row.project_id),
    chatTurnA: str(row.chat_turn_a),
    chatTurnB: str(row.chat_turn_b),
    humanSxsRating: HumanSxsRatingConverter.convertToEntityAttribute(row.human_sxs_rating),
    humanSxsNotes: str(row.human_sxs_notes),
    userId: str(row.user_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toRow(e: SXSHumanFeedback): Record<string, Param> {
  return {
    id: e.id,
    pair_id: e.pairId,
    project_id: e.projectId,
    chat_turn_a: e.chatTurnA,
    chat_turn_b: e.chatTurnB,
    human_sxs_rating: HumanSxsRatingConverter.convertToDatabaseColumn(e.humanSxsRating),
    human_sxs_notes: e.humanSxsNotes,
    user_id: e.userId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

export function toJson(e: SXSHumanFeedback): Record<string, unknown> {
  const { userId: _u, ...rest } = e;
  return rest;
}
