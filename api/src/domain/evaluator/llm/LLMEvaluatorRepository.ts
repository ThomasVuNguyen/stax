/**
 * Port of domain/evaluator/llm/LLMEvaluatorRepository (JpaRepository<LLMEvaluator, String>).
 *
 * - `user` params become `userId`; ScopeType params stay enum strings.
 * - `findPairwiseEvaluatorByIdAndUser` returns a PairwiseLLMEvaluator (as in Java).
 * - Helper loaders for the EAGER `inputs` (llm_turn_inputs): `findInputsByEvaluatorId`,
 *   `findInputsByEvaluatorIds` (Map), `saveInputs(db, evaluatorId, inputs)` (upserts inputs and
 *   replaces join rows). `save` persists the evaluator row only.
 * - delete/deleteById also delete the llm_turn_inputs rows (not the model_input rows).
 * - Inherited: findById, findAllById, existsById, save, saveStmt, delete, deleteById.
 */
import { all, allIn, first, scalar } from "../../../lib/db";
import { touch, upsertStmt } from "../../../entities/EntitySupport";
import {
  type LLMEvaluator,
  INPUTS_JOIN_TABLE,
  TABLE,
  fromRow,
  prePersist,
  toRow,
} from "../../../entities/LLMEvaluator";
import * as ModelInputEntity from "../../../entities/ModelInput";
import type { ModelInput } from "../../../entities/ModelInput";
import * as PairwiseLLMEvaluatorEntity from "../../../entities/PairwiseLLMEvaluator";
import type { PairwiseLLMEvaluator } from "../../../entities/PairwiseLLMEvaluator";
import type { ScopeType } from "../../../enums/ScopeType";

/** Derived `findAllByUserOrType(user, type)` (null-safe like Spring). */
export async function findAllByUserOrType(
  db: D1Database,
  userId: string | null,
  type: ScopeType | null,
): Promise<LLMEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE user_id IS ? OR type IS ?`, userId, type);
  return rows.map(fromRow);
}

export async function findAllNonDeprecatedByUser(db: D1Database, userId: string): Promise<LLMEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE user_id = ? AND is_deprecated = 0`, userId);
  return rows.map(fromRow);
}

export async function findAllNonDeprecatedByType(db: D1Database, type: ScopeType): Promise<LLMEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE type = ? AND is_deprecated = 0`, type);
  return rows.map(fromRow);
}

export async function findByIdAndUser(db: D1Database, id: string, userId: string): Promise<LLMEvaluator | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ? AND user_id = ?`, id, userId);
  return row ? fromRow(row) : null;
}

export async function checkIfLLMEvaluatorNameExists(
  db: D1Database,
  name: string,
  userId: string,
  type: ScopeType,
): Promise<boolean> {
  const n = await scalar<number>(
    db,
    `SELECT COUNT(*) FROM "${TABLE}" WHERE name = ? AND (user_id = ? OR type = ?)`,
    name,
    userId,
    type,
  );
  return (n ?? 0) > 0;
}

export async function findByNameAndUserOrType(
  db: D1Database,
  name: string,
  userId: string,
  type: ScopeType,
): Promise<LLMEvaluator | null> {
  const row = await first(
    db,
    `SELECT * FROM "${TABLE}" WHERE name = ? AND (user_id = ? OR type = ?) LIMIT 1`,
    name,
    userId,
    type,
  );
  return row ? fromRow(row) : null;
}

export async function findSystemEvaluatorByIdOrUserEvaluatorByIdAndUser(
  db: D1Database,
  id: string,
  userId: string,
): Promise<LLMEvaluator | null> {
  const row = await first(
    db,
    `SELECT * FROM "${TABLE}" WHERE (id = ? AND type = 'SYSTEM') OR (id = ? AND user_id = ? AND type = 'USER') LIMIT 1`,
    id,
    id,
    userId,
  );
  return row ? fromRow(row) : null;
}

/** Evaluator of the most recently updated score among the container's model responses. */
export async function findLatestRunEvaluatorByContainerId(
  db: D1Database,
  containerId: string,
): Promise<LLMEvaluator | null> {
  const row = await first(
    db,
    `SELECT le.* FROM score s
     JOIN "${TABLE}" le ON le.id = s.llm_evaluator
     JOIN model_response mr ON mr.id = s.model_response_id
     WHERE mr.container_id = ?
     ORDER BY s.updated_at DESC LIMIT 1`,
    containerId,
  );
  return row ? fromRow(row) : null;
}

export async function findPairwiseEvaluatorByIdAndUser(
  db: D1Database,
  evaluatorId: string,
  userId: string,
): Promise<PairwiseLLMEvaluator | null> {
  const row = await first(
    db,
    `SELECT * FROM "${PairwiseLLMEvaluatorEntity.TABLE}" WHERE (user_id = ? OR type = 'SYSTEM') AND id = ? LIMIT 1`,
    userId,
    evaluatorId,
  );
  return row ? PairwiseLLMEvaluatorEntity.fromRow(row) : null;
}
