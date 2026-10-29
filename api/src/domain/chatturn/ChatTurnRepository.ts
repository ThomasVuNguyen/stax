/**
 * Port of domain/chatturn/ChatTurnRepository (JpaRepository<ChatTurn, String>).
 *
 * Entity/collection parameters become ids: `User user` → `userId`, `EvaluationContainer
 * container` → `containerId`, `Chat chat` → `chatId`, `List<Chat> chats` → `chatIds`,
 * `ModelResponse modelResponse` → `modelResponseId`, `ModelInput input(s)` → `inputId(s)`.
 *
 * Helper loaders (not in Java; replace JPA eager/cascade behaviour of ChatTurn):
 * - `findInputsByTurnId(db, turnId)` / `findInputsByTurnIds(db, turnIds)`: the EAGER
 *   @ManyToMany `inputs` through `turn_inputs` (join-table insertion order).
 * - `saveInputs(db, turnId, inputs)` / `saveInputsStmts(...)`: cascade PERSIST/MERGE of `inputs`
 *   — upserts the ModelInput rows and replaces the turn's `turn_inputs` rows.
 * - The EAGER `modelResponse` is `ModelResponseRepository.findById(db, turn.modelResponseId)`;
 *   the @OneToOne `inferenceStatus` is `InferenceStatusRepository.findByChatTurnId(db, turnId)`.
 * Saving a turn does NOT save its inputs/modelResponse/inferenceStatus: save the ModelResponse
 * first, then the turn, then `saveInputs`, then the InferenceStatus.
 *
 * Deletes (`delete`, `deleteAll`, `deleteById`) apply the JPA cascades: the turn's
 * inference_status (cascade ALL) and its turn_inputs join rows are deleted before the turn.
 * pairwise_score / sxs_evaluation_pair rows cascade through their FKs (ON DELETE CASCADE).
 *
 * `saveAllAndFlush` = `saveAll` (no persistence context to flush).
 */
import { type Param, type Row, allIn, chunk, first, placeholders, scalar, stmt, all } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type ChatTurn, COLUMNS, TABLE, fromRow, prePersist, toRow } from "../../entities/ChatTurn";
import * as ModelInputEntity from "../../entities/ModelInput";
import type { ModelInput } from "../../entities/ModelInput";
import type { InputUsageCountDTO } from "../../entities/InputUsageCountDTO";
import type { ModelProvider } from "../../enums/ModelProvider";
import { InputRole, inputRoleToOrdinal } from "../../enums/InputRole";
import * as ModelProviderConverter from "../../util/converter/ModelProviderConverter";
import { type Page, type Pageable, limitOffset, orderBy, pageOf } from "../../util/Page";

const SORT_COLUMNS: Record<string, string> = Object.fromEntries(
  Object.entries(COLUMNS).map(([k, c]) => [k, `ct.${c}`]),
);

/** Tag filter of the JPQL: `:tagIds IS NULL OR :tagCount = 0 OR (count of matching tags) >= :tagCount`. */
function tagFilter(tagIds: string[] | null | undefined, tagCount: number | null | undefined): [string, Param[]] {
  if (tagIds == null || tagCount === 0) return ["", []];
  return [
    ` AND (SELECT COUNT(DISTINCT tl.tag_id) FROM tag_link tl
           WHERE tl.target_id = ct.id AND tl.target_type = 'CHAT_TURN'
             AND tl.tag_id IN ${placeholders(tagIds.length)}) >= ?`,
    [...tagIds, tagCount ?? null],
  ];
}

const map = (rows: Row[]) => rows.map(fromRow);

// ---------------------------------------------------------------------------------------------
// Inherited JpaRepository methods used by the Java code

export async function findById(db: D1Database, id: string): Promise<ChatTurn | null> {
  const row = await first(db, `SELECT * FROM chat_turns WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<ChatTurn[]> {
  return map(await allIn(db, (inn) => `SELECT * FROM chat_turns WHERE id IN ${inn}`, ids));
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: ChatTurn): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: ChatTurn): Promise<ChatTurn> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: ChatTurn[]): Promise<ChatTurn[]> {
  for (const part of chunk(es, 50)) {
    if (part.length) await db.batch(part.map((e) => saveStmt(db, e)));
  }
  return es;
}

export const saveAllAndFlush = saveAll;

/** Cascade statements for removing turns (inference_status, turn_inputs, then the turn). */
export function deleteStmts(db: D1Database, ids: string[]): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const part of chunk(ids)) {
    const inn = placeholders(part.length);
    out.push(
      stmt(db, `DELETE FROM inference_status WHERE chat_turn_id IN ${inn}`, ...part),
      stmt(db, `DELETE FROM turn_inputs WHERE turn_id IN ${inn}`, ...part),
      stmt(db, `DELETE FROM chat_turns WHERE id IN ${inn}`, ...part),
    );
  }
  return out;
}

export async function deleteAllById(db: D1Database, ids: string[]): Promise<void> {
  const stmts = deleteStmts(db, ids.filter((id) => id != null));
  if (stmts.length) await db.batch(stmts);
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await deleteAllById(db, [id]);
}

async function delete_(db: D1Database, e: ChatTurn): Promise<void> {
  if (e.id) await deleteAllById(db, [e.id]);
}
export { delete_ as delete };

export async function deleteAll(db: D1Database, es: ChatTurn[]): Promise<void> {
  await deleteAllById(db, es.map((e) => e.id).filter((id): id is string => id != null));
}

// ---------------------------------------------------------------------------------------------
// Declared repository methods

export async function findByChatIdAndUserIdOrderBySequenceId(
  db: D1Database,
  chatId: string,
  userId: string,
  tagIds: string[] | null,
  tagCount: number | null,
): Promise<ChatTurn[]> {
  const [tagSql, tagParams] = tagFilter(tagIds, tagCount);
  return map(
    await all(
      db,
      `SELECT ct.* FROM chat_turns ct WHERE ct.chat_id = ? AND ct.user_id = ?${tagSql} ORDER BY ct.sequence_id ASC`,
      chatId,
      userId,
      ...tagParams,
    ),
  );
}

export async function findByChatIn(db: D1Database, chatIds: string[]): Promise<ChatTurn[]> {
  return map(await allIn(db, (inn) => `SELECT * FROM chat_turns WHERE chat_id IN ${inn}`, chatIds));
}

export async function findByIdAndUser(db: D1Database, chatTurnId: string, userId: string): Promise<ChatTurn | null> {
  const row = await first(db, `SELECT * FROM chat_turns WHERE id = ? AND user_id = ?`, chatTurnId, userId);
  return row ? fromRow(row) : null;
}

export async function findByChatIdAndContainerAndUserIdOrderBySequenceId(
  db: D1Database,
  chatId: string,
  containerId: string,
  userId: string,
): Promise<ChatTurn[]> {
  return map(
    await all(
      db,
      `SELECT ct.* FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id
       WHERE ct.chat_id = ? AND c.container_id = ? AND ct.user_id = ? ORDER BY ct.sequence_id ASC`,
      chatId,
      containerId,
      userId,
    ),
  );
}

/**
 * Java loads modelResponse.humanEvalScores.humanEvaluator via an @EntityGraph; here only the turn
 * is returned (load those with ModelResponseRepository helpers).
 */
export async function findByChatTurnIdAndUserId(db: D1Database, id: string, userId: string): Promise<ChatTurn | null> {
  return findByIdAndUser(db, id, userId);
}

export async function findChatTillSequence(
  db: D1Database,
  chatId: string,
  sequenceId: number,
  userId: string,
): Promise<ChatTurn[]> {
  return map(
    await all(
      db,
      `SELECT * FROM chat_turns WHERE chat_id = ? AND user_id = ? AND sequence_id <= ? ORDER BY sequence_id ASC`,
      chatId,
      userId,
      sequenceId,
    ),
  );
}

/** Latest turn (max sequence) of every chat in the container, optionally tag-filtered, paged. */
export async function findLatestChatTurnsByUser(
  db: D1Database,
  userId: string,
  containerId: string,
  tagIds: string[] | null,
  tagCount: number | null,
  pageable: Pageable,
): Promise<Page<ChatTurn>> {
  const [tagSql, tagParams] = tagFilter(tagIds, tagCount);
  const where = `FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id
    WHERE ct.user_id = ? AND c.container_id = ?
      AND (ct.chat_id, ct.sequence_id) IN (
        SELECT cta.chat_id, MAX(cta.sequence_id) FROM chat_turns cta JOIN chat ca ON ca.id = cta.chat_id
        WHERE cta.user_id = ? AND ca.container_id = ? GROUP BY cta.chat_id)${tagSql}`;
  const params: Param[] = [userId, containerId, userId, containerId, ...tagParams];
  const total = (await scalar<number>(db, `SELECT COUNT(ct.id) ${where}`, ...params)) ?? 0;
  const rows = await all(
    db,
    `SELECT ct.* ${where} ${orderBy(pageable, SORT_COLUMNS)} LIMIT ? OFFSET ?`,
    ...params,
    ...limitOffset(pageable),
  );
  return pageOf(map(rows), pageable, total);
}

export async function findChatTurnsByList(db: D1Database, chatTurnIds: string[], userId: string): Promise<ChatTurn[]> {
  return map(
    await allIn(db, (inn) => `SELECT * FROM chat_turns WHERE id IN ${inn} AND user_id = ?`, chatTurnIds, userId),
  );
}

export async function findChatTurnsByChatList(db: D1Database, chatIds: string[], userId: string): Promise<ChatTurn[]> {
  return map(
    await allIn(db, (inn) => `SELECT * FROM chat_turns WHERE chat_id IN ${inn} AND user_id = ?`, chatIds, userId),
  );
}

export async function countDistinctChatIdsByContainer(db: D1Database, containerId: string, userId: string): Promise<number> {
  return (
    (await scalar<number>(
      db,
      `SELECT COUNT(DISTINCT ct.chat_id) FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id
       WHERE c.container_id = ? AND ct.user_id = ?`,
      containerId,
      userId,
    )) ?? 0
  );
}

export async function findAllByUserAndChatContainer(db: D1Database, userId: string, containerId: string): Promise<ChatTurn[]> {
  return map(
    await all(
      db,
      `SELECT ct.* FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id WHERE ct.user_id = ? AND c.container_id = ?`,
      userId,
      containerId,
    ),
  );
}

export async function findAllByUserAndContainerAndIdIn(
  db: D1Database,
  userId: string,
  containerId: string,
  ids: string[],
): Promise<ChatTurn[]> {
  return map(
    await allIn(
      db,
      (inn) =>
        `SELECT ct.* FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id
         WHERE ct.id IN ${inn} AND ct.user_id = ? AND c.container_id = ?`,
      ids,
      userId,
      containerId,
    ),
  );
}

export async function findChatTurnByIdAndContainerAndUser(
  db: D1Database,
  id: string,
  containerId: string,
  userId: string,
): Promise<ChatTurn | null> {
  const row = await first(
    db,
    `SELECT ct.* FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id
     WHERE ct.user_id = ? AND c.container_id = ? AND ct.id = ?`,
    userId,
    containerId,
    id,
  );
  return row ? fromRow(row) : null;
}

/** null when the chat has no turns (JPQL MAX over no rows). */
export async function findMaxSequenceIdByUserAndContainerAndChatId(
  db: D1Database,
  userId: string,
  containerId: string,
  chatId: string,
): Promise<number | null> {
  return scalar<number>(
    db,
    `SELECT MAX(ct.sequence_id) FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id
     WHERE ct.user_id = ? AND ct.chat_id = ? AND c.container_id = ?`,
    userId,
    chatId,
    containerId,
  );
}

export async function findAllChatIdsByUserAndContainer(db: D1Database, userId: string, containerId: string): Promise<string[]> {
  const rows = await all<{ chat_id: string }>(
    db,
    `SELECT DISTINCT ct.chat_id FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id WHERE ct.user_id = ? AND c.container_id = ?`,
    userId,
    containerId,
  );
  return rows.map((r) => r.chat_id);
}

export async function findAllByUserAndContainerAndChatId(
  db: D1Database,
  userId: string,
  containerId: string,
  chatId: string,
): Promise<ChatTurn[]> {
  return map(
    await all(
      db,
      `SELECT ct.* FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id
       WHERE ct.user_id = ? AND c.container_id = ? AND ct.chat_id = ?`,
      userId,
      containerId,
      chatId,
    ),
  );
}

export async function findAllByUserAndContainerAndChatIdIn(
  db: D1Database,
  userId: string,
  containerId: string,
  chatIds: string[],
): Promise<ChatTurn[]> {
  return map(
    await allIn(
      db,
      (inn) =>
        `SELECT ct.* FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id
         WHERE ct.chat_id IN ${inn} AND ct.user_id = ? AND c.container_id = ?`,
      chatIds,
      userId,
      containerId,
    ),
  );
}

export async function existsByModelResponse(db: D1Database, modelResponseId: string): Promise<boolean> {
  return (await first(db, `SELECT 1 AS x FROM chat_turns WHERE model_response_id = ? LIMIT 1`, modelResponseId)) != null;
}

export async function countChatTurnsUsingInput(db: D1Database, inputId: string): Promise<number> {
  return (
    (await scalar<number>(
      db,
      `SELECT COUNT(ct.id) FROM chat_turns ct JOIN turn_inputs ti ON ti.turn_id = ct.id WHERE ti.input_id = ?`,
      inputId,
    )) ?? 0
  );
}

/** Usage count per input id (only inputs used by at least one turn are returned). */
export async function countUsagesForInputs(db: D1Database, inputIds: string[]): Promise<InputUsageCountDTO[]> {
  const rows = await allIn<{ input_id: string; usage_count: number }>(
    db,
    (inn) =>
      `SELECT ti.input_id AS input_id, COUNT(ct.id) AS usage_count
       FROM chat_turns ct JOIN turn_inputs ti ON ti.turn_id = ct.id
       WHERE ti.input_id IN ${inn} GROUP BY ti.input_id`,
    [...new Set(inputIds)],
  );
  return rows.map((r) => ({ inputId: r.input_id, usageCount: Number(r.usage_count) }));
}

export async function findLatestChatTurnIdsByContainerId(db: D1Database, containerId: string, userId: string): Promise<string[]> {
  const rows = await all<{ id: string }>(
    db,
    `SELECT ct.id FROM chat_turns ct WHERE (ct.chat_id, ct.sequence_id) IN (
       SELECT cta.chat_id, MAX(cta.sequence_id) FROM chat_turns cta JOIN chat ca ON ca.id = cta.chat_id
       WHERE ca.container_id = ? AND cta.user_id = ? GROUP BY cta.chat_id)`,
    containerId,
    userId,
  );
  return rows.map((r) => r.id);
}

export async function findChatTurnIdsByContainerId(db: D1Database, containerId: string, userId: string): Promise<string[]> {
  const rows = await all<{ id: string }>(
    db,
    `SELECT ct.id FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id WHERE c.container_id = ? AND ct.user_id = ?`,
    containerId,
    userId,
  );
  return rows.map((r) => r.id);
}

export async function countByContainer(db: D1Database, containerId: string): Promise<number> {
  return (
    (await scalar<number>(
      db,
      `SELECT COUNT(ct.id) FROM chat_turns ct JOIN chat c ON c.id = ct.chat_id WHERE c.container_id = ?`,
      containerId,
    )) ?? 0
  );
}

export async function findIdsWithNonEmptyModelResponse(db: D1Database, chatTurnIds: string[]): Promise<string[]> {
  const rows = await allIn<{ id: string }>(
    db,
    (inn) =>
      `SELECT ct.id FROM chat_turns ct JOIN model_response mr ON mr.id = ct.model_response_id
       WHERE ct.id IN ${inn} AND mr.text IS NOT NULL AND TRIM(mr.text) <> ''`,
    chatTurnIds,
  );
  return rows.map((r) => r.id);
}

export async function countByChat(db: D1Database, chatId: string): Promise<number> {
  return (await scalar<number>(db, `SELECT COUNT(*) FROM chat_turns WHERE chat_id = ?`, chatId)) ?? 0;
}

/**
 * Turns having a SYSTEM input (`inp.role = 2`, ordinal), ordered by createdAt. Like the JPQL
 * inner join, a turn with several SYSTEM inputs appears once per input.
 */
export async function findSystemInstructionTurnsInChats(db: D1Database, chatIds: string[]): Promise<ChatTurn[]> {
  const rows = await allIn(
    db,
    (inn) =>
      `SELECT ct.* FROM chat_turns ct JOIN turn_inputs ti ON ti.turn_id = ct.id JOIN model_input inp ON inp.id = ti.input_id
       WHERE ct.chat_id IN ${inn} AND inp.role = ? ORDER BY ct.created_at ASC`,
    chatIds,
    inputRoleToOrdinal(InputRole.SYSTEM),
  );
  // allIn concatenates chunk results; re-sort to keep the global createdAt order.
  return map(rows).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

export async function findDistinctModelProvidersByContainerId(
  db: D1Database,
  containerId: string,
  userId: string,
): Promise<ModelProvider[]> {
  const rows = await all<{ provider: string }>(
    db,
    `SELECT DISTINCT m.provider AS provider FROM chat_turns ct
     JOIN chat c ON c.id = ct.chat_id
     JOIN model_response mr ON mr.id = ct.model_response_id
     JOIN model m ON m.id = mr.model_id
     WHERE c.container_id = ? AND ct.user_id = ?`,
    containerId,
    userId,
  );
  return rows
    .map((r) => ModelProviderConverter.convertToEntityAttribute(r.provider))
    .filter((p): p is ModelProvider => p != null);
}

/** Java fetch-joins chat, modelResponse and inputs; load those with the helpers when needed. */
export async function findForCopy(db: D1Database, chatIds: string[]): Promise<ChatTurn[]> {
  return map(await allIn(db, (inn) => `SELECT DISTINCT ct.* FROM chat_turns ct WHERE ct.chat_id IN ${inn}`, chatIds));
}

export async function findByChatIdAndUserIdUntilSequenceIdOrderBySequenceId(
  db: D1Database,
  chatId: string,
  userId: string,
  maxSequenceId: number,
): Promise<ChatTurn[]> {
  return findChatTillSequence(db, chatId, maxSequenceId, userId);
}

// ---------------------------------------------------------------------------------------------
// Helper loaders for the ChatTurn.inputs @ManyToMany (turn_inputs)

export async function findInputsByTurnId(db: D1Database, turnId: string): Promise<ModelInput[]> {
  const rows = await all(
    db,
    `SELECT mi.* FROM turn_inputs ti JOIN model_input mi ON mi.id = ti.input_id WHERE ti.turn_id = ? ORDER BY ti.rowid`,
    turnId,
  );
  return rows.map(ModelInputEntity.fromRow);
}

/** Inputs of many turns at once: turnId → inputs (every requested id is present in the map). */
export async function findInputsByTurnIds(db: D1Database, turnIds: string[]): Promise<Map<string, ModelInput[]>> {
  const out = new Map<string, ModelInput[]>(turnIds.map((id) => [id, []]));
  const rows = await allIn<Row & { __turn_id: string }>(
    db,
    (inn) =>
      `SELECT ti.turn_id AS __turn_id, mi.* FROM turn_inputs ti JOIN model_input mi ON mi.id = ti.input_id
       WHERE ti.turn_id IN ${inn} ORDER BY ti.rowid`,
    [...new Set(turnIds)],
  );
  for (const r of rows) {
    const list = out.get(r.__turn_id) ?? [];
    list.push(ModelInputEntity.fromRow(r));
    out.set(r.__turn_id, list);
  }
  return out;
}

/**
 * Statements persisting `inputs` (cascade PERSIST/MERGE: upsert each ModelInput, assigning ids
 * and timestamps in place) and replacing the turn's join rows, in list order.
 */
export function saveInputsStmts(db: D1Database, turnId: string, inputs: ModelInput[]): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const input of inputs) {
    if (input.id == null) ModelInputEntity.prePersist(input);
    touch(input);
    out.push(upsertStmt(db, ModelInputEntity.TABLE, ModelInputEntity.toRow(input)));
  }
  out.push(stmt(db, `DELETE FROM turn_inputs WHERE turn_id = ?`, turnId));
  for (const input of inputs) {
    out.push(stmt(db, `INSERT INTO turn_inputs (turn_id, input_id) VALUES (?, ?)`, turnId, input.id));
  }
  return out;
}

export async function saveInputs(db: D1Database, turnId: string, inputs: ModelInput[]): Promise<ModelInput[]> {
  await db.batch(saveInputsStmts(db, turnId, inputs));
  return inputs;
}
