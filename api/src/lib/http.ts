import type { Context } from "hono";
import { IllegalInputException, InvalidDataException, RateLimitExceedException } from "./errors";
import type { AppEnv } from "../env";
import { currentUser } from "./auth";

/** Parses a JSON body; an empty body yields `{}` (Spring's optional @RequestBody). */
export async function jsonBody<T = Record<string, any>>(c: Context): Promise<T> {
  const text = await c.req.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new InvalidDataException("Malformed JSON request body");
  }
}

/** Query param helpers matching Spring @RequestParam binding. */
export function queryInt(c: Context, name: string, fallback?: number): number | undefined {
  const v = c.req.query(name);
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new IllegalInputException(`Invalid value for parameter '${name}'`);
  return n;
}

export function queryBool(c: Context, name: string, fallback?: boolean): boolean | undefined {
  const v = c.req.query(name);
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
}

/** Repeated (`?a=1&a=2`) or comma-separated (`?a=1,2`) list params. */
export function queryList(c: Context, name: string): string[] | undefined {
  const vals = c.req.queries(name);
  if (!vals || !vals.length) return undefined;
  return vals.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

export function queryEnum<T extends string>(
  c: Context,
  name: string,
  allowed: readonly T[],
  fallback?: T,
): T | undefined {
  const v = c.req.query(name);
  if (v === undefined || v === "") return fallback;
  if (!allowed.includes(v as T)) {
    throw new IllegalInputException(
      `Invalid value '${v}' for parameter '${name}'. Allowed values are: [${allowed.join(", ")}]`,
    );
  }
  return v as T;
}

/** Fails like @NotBlank / @NotNull validation would. */
export function requireField<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    throw new InvalidDataException(message);
  }
  return value;
}

/** Port of the in-memory @RateLimited aspect (per isolate, per user, per handler key). */
const rateWindows = new Map<string, { count: number; start: number }>();

export function rateLimit(
  c: Context<AppEnv>,
  key: string,
  maxRequests = 50_000,
  windowSeconds = 60,
) {
  const user = currentUser(c);
  const k = `${user.email}-${key}`;
  const nowMs = Date.now();
  let info = rateWindows.get(k);
  if (!info || nowMs - info.start > windowSeconds * 1000) {
    info = { count: 0, start: nowMs };
  }
  if (info.count >= maxRequests) {
    throw new RateLimitExceedException(
      `User not allowed more than ${maxRequests} requests in ${windowSeconds} seconds`,
    );
  }
  info.count++;
  rateWindows.set(k, info);
}
