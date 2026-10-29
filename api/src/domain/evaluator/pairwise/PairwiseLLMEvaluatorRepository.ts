/**
 * Port of domain/evaluator/pairwise/PairwiseLLMEvaluatorRepository
 * (JpaRepository<PairwiseLLMEvaluator, String>).
 *
 * - `user` params become `userId`.
 * - Helper loaders for the EAGER `inputs` (pairwise_llm_turn_inputs): `findInputsByEvaluatorId`,
 *   `findInputsByEvaluatorIds` (Map), `saveInputs(db, evaluatorId, inputs)`. `save` persists the
 *   evaluator row only.
 * - delete/deleteById also delete the pairwise_llm_turn_inputs rows.
 * - Inherited: findById, findAllById, existsById, save, saveStmt, delete, deleteById.
 */
import { all, allIn, first, scalar } from "../../../lib/db";
import { touch, upsertStmt } from "../../../entities/EntitySupport";
import * as ModelInputEntity from "../../../entities/ModelInput";
import type { ModelInput } from "../../../entities/ModelInput";
import {
  type PairwiseLLMEvaluator,
  INPUTS_JOIN_TABLE,
  TABLE,
  fromRow,
  prePersist,
  toRow,
} from "../../../entities/PairwiseLLMEvaluator";
import type { ScopeType } from "../../../enums/ScopeType";

/** Derived `findAllByUserOrType(user, type)` (null-safe like Spring). */
export async function findAllByUserOrType(
  db: D1Database,
  userId: string | null,
  type: ScopeType | null,
): Promise<PairwiseLLMEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE user_id IS ? OR type IS ?`, userId, type);
  return rows.map(fromRow);
}

export async function checkIfPairwiseLLMEvaluatorNameExists(
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

// --- Inherited JpaRepository methods and the EAGER `inputs` loaders ---

export async function findById(db: D1Database, id: string): Promise<PairwiseLLMEvaluator | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<PairwiseLLMEvaluator[]> {
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
export function saveStmt(db: D1Database, e: PairwiseLLMEvaluator): D1PreparedStatement {
  prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

/** Saves the evaluator row only (use saveInputs for `inputs`). */
export async function save(db: D1Database, e: PairwiseLLMEvaluator): Promise<PairwiseLLMEvaluator> {
  await saveStmt(db, e).run();
  return e;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM "${INPUTS_JOIN_TABLE}" WHERE turn_id = ?`).bind(id),
    db.prepare(`DELETE FROM "${TABLE}" WHERE id = ?`).bind(id),
  ]);
}

async function delete_(db: D1Database, e: PairwiseLLMEvaluator): Promise<void> {
  if (e.id != null) await deleteById(db, e.id);
}
export { delete_ as delete };
