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
