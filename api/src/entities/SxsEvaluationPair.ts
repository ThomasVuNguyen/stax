import { newId } from "../lib/db";
import { type Param, type Row, jsonMap, mapColumn, str } from "./EntitySupport";

export const TABLE = "sxs_evaluation_pair";
export const ID_PREFIX = "sxs-pair-";

/**
 * `pairwiseScores` (@OneToMany mappedBy pair, cascade ALL) is not on the interface; the FK
 * pairwise_score.sxs_evaluation_pair has ON DELETE CASCADE.
 */
export interface SxsEvaluationPair {
  id: string | null;
  /** @ManyToOne EvaluationContainer container (container_id) */
  containerId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne Chat chatA (column chat_a) */
  chatAId: string | null;
  /** @ManyToOne Chat chatB (column chat_b) */
  chatBId: string | null;
  /** @ManyToOne ChatTurn chatTurnA (column chat_turn_id_a) */
  chatTurnAId: string | null;
  /** @ManyToOne ChatTurn chatTurnB (column chat_turn_id_b) */
  chatTurnBId: string | null;
  expectedOutput: string | null;
  variables: Record<string, string> | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const COLUMNS: Record<keyof SxsEvaluationPair, string> = {
  id: "id",
  containerId: "container_id",
  userId: "user_id",
  chatAId: "chat_a",
  chatBId: "chat_b",
  chatTurnAId: "chat_turn_id_a",
  chatTurnBId: "chat_turn_id_b",
  expectedOutput: "expected_output",
  variables: "variables",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function create(init: Partial<SxsEvaluationPair> = {}): SxsEvaluationPair {
  return {
    id: null,
    containerId: null,
    userId: null,
    chatAId: null,
    chatBId: null,
    chatTurnAId: null,
    chatTurnBId: null,
    expectedOutput: null,
    variables: null,
    createdAt: null,
    updatedAt: null,
    ...init,
  };
}

export function prePersist(e: SxsEvaluationPair): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): SxsEvaluationPair {
  return {
    id: str(row.id),
    containerId: str(row.container_id),
    userId: str(row.user_id),
    chatAId: str(row.chat_a),
    chatBId: str(row.chat_b),
    chatTurnAId: str(row.chat_turn_id_a),
    chatTurnBId: str(row.chat_turn_id_b),
    expectedOutput: str(row.expected_output),
    variables: jsonMap(row.variables),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toRow(e: SxsEvaluationPair): Record<string, Param> {
  return {
    id: e.id,
    container_id: e.containerId,
    user_id: e.userId,
    chat_a: e.chatAId,
    chat_b: e.chatBId,
    chat_turn_id_a: e.chatTurnAId,
    chat_turn_id_b: e.chatTurnBId,
    expected_output: e.expectedOutput,
    variables: mapColumn(e.variables),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/** Scalar fields; callers add container/user/chatA/chatB/chatTurnA/chatTurnB/pairwiseScores. */
export function toJson(e: SxsEvaluationPair): Record<string, unknown> {
  return {
    id: e.id,
    expectedOutput: e.expectedOutput,
    variables: e.variables,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}
