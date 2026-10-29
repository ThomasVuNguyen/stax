/**
 * Thin helpers over D1. Modules write plain SQL against the schema in migrations/0001_schema.sql
 * (a 1:1 translation of the original MySQL schema) and use these helpers for the common shapes.
 *
 * Conventions:
 * - Timestamps are stored as ISO-8601 UTC strings (`now()`); compare them as strings.
 * - Booleans (MySQL BIT(1)) are INTEGER 0/1: write with `bool()`, read with `toBool()`.
 * - JSON columns are TEXT: write with `JSON.stringify`, read with `parseJson()`.
 * - D1 has no interactive transactions; group writes that must be atomic into `db.batch([...])`.
 */

export type Row = Record<string, unknown>;
export type Param = string | number | null | boolean | undefined;

function bind(db: D1Database, sql: string, params: Param[]): D1PreparedStatement {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params.map(normalize)) : stmt;
}

function normalize(p: Param): string | number | null {
  if (p === undefined || p === null) return null;
  if (typeof p === "boolean") return p ? 1 : 0;
  return p;
}

export function stmt(db: D1Database, sql: string, ...params: Param[]): D1PreparedStatement {
  return bind(db, sql, params);
}

export async function all<T = Row>(db: D1Database, sql: string, ...params: Param[]): Promise<T[]> {
  const res = await bind(db, sql, params).all<T>();
  return res.results ?? [];
}

export async function first<T = Row>(
  db: D1Database,
  sql: string,
  ...params: Param[]
): Promise<T | null> {
  return (await bind(db, sql, params).first<T>()) ?? null;
}

export async function run(db: D1Database, sql: string, ...params: Param[]): Promise<D1Result> {
  return bind(db, sql, params).run();
}

export async function scalar<T = number>(
  db: D1Database,
  sql: string,
  ...params: Param[]
): Promise<T | null> {
  const row = await bind(db, sql, params).first<Row>();
  if (!row) return null;
  return Object.values(row)[0] as T;
}

/**
 * Builds `(?, ?, ?)` for an IN clause. D1 caps bound parameters per statement at 100, so callers
 * with larger lists should use `chunk()`.
 */
export function placeholders(n: number): string {
  return `(${Array.from({ length: n }, () => "?").join(", ")})`;
}

export function chunk<T>(items: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `SELECT ... WHERE col IN (...)` over arbitrarily many ids, chunked under D1's limit. */
export async function allIn<T = Row>(
  db: D1Database,
  sqlWithIn: (inClause: string) => string,
  ids: Param[],
  ...extraParams: Param[]
): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (const part of chunk(ids, 90 - extraParams.length)) {
    out.push(...(await all<T>(db, sqlWithIn(placeholders(part.length)), ...part, ...extraParams)));
  }
  return out;
}

/** Inserts a row from an object of column -> value. */
export function insertStmt(db: D1Database, table: string, values: Record<string, Param>) {
  const cols = Object.keys(values);
  const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES ${placeholders(cols.length)}`;
  return bind(db, sql, Object.values(values));
}

export async function insert(db: D1Database, table: string, values: Record<string, Param>) {
  return insertStmt(db, table, values).run();
}

/** Updates columns on a row by id. Undefined values are skipped; null writes NULL. */
export function updateStmt(
  db: D1Database,
  table: string,
  id: string,
  values: Record<string, Param>,
  idColumn = "id",
) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined);
  const sets = entries.map(([c]) => `"${c}" = ?`).join(", ");
  return bind(db, `UPDATE "${table}" SET ${sets} WHERE "${idColumn}" = ?`, [
    ...entries.map(([, v]) => v),
    id,
  ]);
}

export async function update(
  db: D1Database,
  table: string,
  id: string,
  values: Record<string, Param>,
  idColumn = "id",
) {
  return updateStmt(db, table, id, values, idColumn).run();
}

export function bool(v: boolean | null | undefined): number | null {
  return v === null || v === undefined ? null : v ? 1 : 0;
}

export function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return v === 1 || v === true || v === "1" || v === "true";
}

export function parseJson<T = unknown>(v: unknown, fallback: T | null = null): T | null {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v !== "string") return v as T;
  try {
    let parsed = JSON.parse(v);
    // Seed data occasionally holds double-encoded JSON strings (see ObjectMapperUtil).
    if (typeof parsed === "string" && /^[\[{]/.test(parsed.trim())) parsed = JSON.parse(parsed);
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function toJsonColumn(v: unknown): string | null {
  return v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
}

/** Current time as stored in the database (ISO-8601 UTC with milliseconds). */
export function now(): string {
  return new Date().toISOString();
}

/** IDs follow the Java `@PrePersist` convention: `<prefix><uuid>`, e.g. `project-…`. */
export function newId(prefix: string): string {
  return prefix + crypto.randomUUID();
}
