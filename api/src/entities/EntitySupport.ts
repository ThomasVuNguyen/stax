/**
 * Small helpers shared by the entity row mappers and the repositories' `save` functions.
 * (Not a Java class; internal to the data layer.)
 */
import { type Param, type Row, now, stmt } from "../lib/db";

export function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Map<String, String> JSON columns. */
export function jsonMap(v: unknown): Record<string, string> | null {
  if (v === null || v === undefined || v === "") return null;
  let parsed: unknown = v;
  try {
    if (typeof v === "string") {
      parsed = JSON.parse(v);
      // Double-encoded JSON strings exist in some data (see ObjectMapperUtil).
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
    }
  } catch {
    return null;
  }
  return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
}

export function mapColumn(v: Record<string, string> | null | undefined): string | null {
  return v === null || v === undefined ? null : JSON.stringify(v);
}

/**
 * `INSERT … ON CONFLICT(<id>) DO UPDATE` for a full entity row. `created_at`-like columns listed
 * in `insertOnly` keep their original value on update (@CreationTimestamp / updatable = false).
 */
export function upsertStmt(
  db: D1Database,
  table: string,
  row: Record<string, Param>,
  idColumn = "id",
  insertOnly: string[] = ["created_at"],
): D1PreparedStatement {
  const cols = Object.keys(row);
  const updates = cols
    .filter((c) => c !== idColumn && !insertOnly.includes(c))
    .map((c) => `"${c}" = excluded."${c}"`);
  const sql =
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ` +
    (updates.length
      ? `ON CONFLICT("${idColumn}") DO UPDATE SET ${updates.join(", ")}`
      : `ON CONFLICT("${idColumn}") DO NOTHING`);
  return stmt(db, sql, ...Object.values(row));
}

/** Applies @CreationTimestamp / @UpdateTimestamp semantics in place. */
export function touch<T extends { createdAt?: string | null; updatedAt?: string | null }>(e: T): T {
  const t = now();
  if (!e.createdAt) e.createdAt = t;
  if ("updatedAt" in e) e.updatedAt = t;
  return e;
}

export type { Row, Param };
