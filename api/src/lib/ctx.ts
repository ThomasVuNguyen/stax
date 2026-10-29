import type { Context } from "hono";
import type { AppEnv, Env } from "../env";
import type { AuthUser } from "./auth";
import { UserAccessDeniedException } from "./errors";

/**
 * Request/job context passed as the first argument to every service function. It replaces Spring
 * dependency injection and SecurityContextHolder.
 */
export interface Ctx {
  env: Env;
  db: D1Database;
  /** Authenticated user (SecurityContextHolder principal). Null inside queue/cron jobs. */
  user: AuthUser | null;
  /** Fire-and-forget work that must finish after the response (replaces @Async / executors). */
  waitUntil(promise: Promise<unknown>): void;
}

export function ctxFromHono(c: Context<AppEnv>): Ctx {
  return {
    env: c.env,
    db: c.env.DB,
    user: c.get("user"),
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  };
}

export function ctxFromJob(env: Env, exec: ExecutionContext, user: AuthUser | null = null): Ctx {
  return { env, db: env.DB, user, waitUntil: (p) => exec.waitUntil(p) };
}

/** The authenticated user; throws like the Java code does when the principal is missing. */
export function requireUser(ctx: Ctx): AuthUser {
  if (!ctx.user) throw new UserAccessDeniedException("User authentication failed.");
  return ctx.user;
}
