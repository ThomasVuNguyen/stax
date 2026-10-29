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

// --- Inherited JpaRepository methods and the EAGER `inputs` loaders ---

export async function findById(db: D1Database, id: string): Promise<LLMEvaluator | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<LLMEvaluator[]> {
  const rows = await allIn(db, (inC) => `SELECT * FROM "${TABLE}" WHERE id IN ${inC}`, [...new Set(ids)]);
  return rows.map(fromRow);
}

export async function existsById(db: D1Database, id: string): Promise<boolean> {
  return ((await scalar<number>(db, `SELECT COUNT(*) FROM "${TABLE}" WHERE id = ?`, id)) ?? 0) > 0;
}

/** Inputs in join-table insertion order. */
export async function findInputsByEvaluatorId(db: D1Database, evaluatorId: string): Promise<ModelInput[]> {
  const rows = await all(
    db,
    `SELECT mi.* FROM "${INPUTS_JOIN_TABLE}" j JOIN model_input mi ON mi.id = j.input_id WHERE j.turn_id = ? ORDER BY j.rowid`,
    evaluatorId,
  );
  return rows.map(ModelInputEntity.fromRow);
}

/** evaluatorId → inputs (every requested id is present in the map). */
export async function findInputsByEvaluatorIds(db: D1Database, evaluatorIds: string[]): Promise<Map<string, ModelInput[]>> {
  const out = new Map<string, ModelInput[]>(evaluatorIds.map((id) => [id, []]));
  const rows = await allIn<Record<string, unknown> & { __eid: string }>(
    db,
    (inC) =>
      `SELECT j.turn_id AS __eid, mi.* FROM "${INPUTS_JOIN_TABLE}" j JOIN model_input mi ON mi.id = j.input_id
       WHERE j.turn_id IN ${inC} ORDER BY j.rowid`,
    [...new Set(evaluatorIds)],
  );
  for (const r of rows) {
    const list = out.get(r.__eid) ?? [];
    list.push(ModelInputEntity.fromRow(r));
    out.set(r.__eid, list);
  }
  return out;
}

/** Cascade PERSIST/MERGE of `inputs`: upserts each ModelInput and replaces the join rows. */
export function saveInputsStmts(db: D1Database, evaluatorId: string, inputs: ModelInput[]): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const input of inputs) {
    if (input.id == null) ModelInputEntity.prePersist(input);
    touch(input);
    out.push(upsertStmt(db, ModelInputEntity.TABLE, ModelInputEntity.toRow(input)));
  }
  out.push(db.prepare(`DELETE FROM "${INPUTS_JOIN_TABLE}" WHERE turn_id = ?`).bind(evaluatorId));
  for (const input of inputs) {
    out.push(db.prepare(`INSERT INTO "${INPUTS_JOIN_TABLE}" (turn_id, input_id) VALUES (?, ?)`).bind(evaluatorId, input.id));
  }
  return out;
}

export async function saveInputs(db: D1Database, evaluatorId: string, inputs: ModelInput[]): Promise<ModelInput[]> {
  await db.batch(saveInputsStmts(db, evaluatorId, inputs));
  return inputs;
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: LLMEvaluator): D1PreparedStatement {
  prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

/** Saves the evaluator row only (use saveInputs for `inputs`). */
export async function save(db: D1Database, e: LLMEvaluator): Promise<LLMEvaluator> {
  await saveStmt(db, e).run();
  return e;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM "${INPUTS_JOIN_TABLE}" WHERE turn_id = ?`).bind(id),
    db.prepare(`DELETE FROM "${TABLE}" WHERE id = ?`).bind(id),
  ]);
}

async function delete_(db: D1Database, e: LLMEvaluator): Promise<void> {
  if (e.id != null) await deleteById(db, e.id);
}
export { delete_ as delete };
