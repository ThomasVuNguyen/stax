/**
 * Port of domain/chat/ChatRepository (JpaRepository<Chat, String>).
 * Entity parameters become ids (`User user` → `userId`, `EvaluationContainer container` →
 * `containerId`).
 *
 * `Chat.turns` (@OneToMany, cascade ALL + orphanRemoval) is not loaded: use
 * `ChatTurnRepository.findByChatIn(db, chatIds)` / `findChatTurnsByChatList`.
 * `findChatsByList` therefore returns the chats only (Java fetch-joined the turns).
 *
 * Deletes (`delete`, `deleteAll`, `deleteById`) apply the JPA cascade to the chat's turns
 * (each turn's inference_status and turn_inputs rows, then the turns — see
 * ChatTurnRepository.deleteStmts) before deleting the chat.
 */
import { all, allIn, chunk, first, placeholders, stmt } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type Chat, TABLE, fromRow, prePersist, toRow } from "../../entities/Chat";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";

export async function findById(db: D1Database, id: string): Promise<Chat | null> {
  const row = await first(db, `SELECT * FROM chat WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findByIdAndUser(db: D1Database, id: string, userId: string): Promise<Chat | null> {
  const row = await first(db, `SELECT * FROM chat WHERE id = ? AND user_id = ?`, id, userId);
  return row ? fromRow(row) : null;
}

export async function findAllByUser(db: D1Database, userId: string): Promise<Chat[]> {
  return (await all(db, `SELECT * FROM chat WHERE user_id = ?`, userId)).map(fromRow);
}

export async function findByUserAndIdIn(db: D1Database, userId: string, ids: string[]): Promise<Chat[]> {
  return (await allIn(db, (inn) => `SELECT * FROM chat WHERE id IN ${inn} AND user_id = ?`, ids, userId)).map(fromRow);
}

export async function findByIdAndContainer(db: D1Database, id: string, containerId: string): Promise<Chat | null> {
  const row = await first(db, `SELECT * FROM chat WHERE id = ? AND container_id = ?`, id, containerId);
  return row ? fromRow(row) : null;
}

export async function findAllByContainer(db: D1Database, containerId: string): Promise<Chat[]> {
  return (await all(db, `SELECT * FROM chat WHERE container_id = ?`, containerId)).map(fromRow);
}

export async function findChatsByList(db: D1Database, ids: string[], userId: string): Promise<Chat[]> {
  return (
    await allIn(db, (inn) => `SELECT DISTINCT * FROM chat WHERE id IN ${inn} AND user_id = ?`, ids, userId)
  ).map(fromRow);
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: Chat): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: Chat): Promise<Chat> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: Chat[]): Promise<Chat[]> {
  for (const part of chunk(es, 50)) if (part.length) await db.batch(part.map((e) => saveStmt(db, e)));
  return es;
}

/** Cascade statements: the chats' turns (with their inference_status / turn_inputs), then the chats. */
export async function deleteStmts(db: D1Database, chatIds: string[]): Promise<D1PreparedStatement[]> {
  const turnIds = (
    await allIn<{ id: string }>(db, (inn) => `SELECT id FROM chat_turns WHERE chat_id IN ${inn}`, chatIds)
  ).map((r) => r.id);
  const out = ChatTurnRepository.deleteStmts(db, turnIds);
  for (const part of chunk(chatIds)) out.push(stmt(db, `DELETE FROM chat WHERE id IN ${placeholders(part.length)}`, ...part));
  return out;
}

export async function deleteAllById(db: D1Database, ids: string[]): Promise<void> {
  const ok = ids.filter((id) => id != null);
  if (!ok.length) return;
  await db.batch(await deleteStmts(db, ok));
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await deleteAllById(db, [id]);
}

async function delete_(db: D1Database, e: Chat): Promise<void> {
  if (e.id) await deleteAllById(db, [e.id]);
}
export { delete_ as delete };

export async function deleteAll(db: D1Database, es: Chat[]): Promise<void> {
  await deleteAllById(db, es.map((e) => e.id).filter((id): id is string => id != null));
}
