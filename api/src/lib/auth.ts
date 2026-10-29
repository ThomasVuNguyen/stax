import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv, Env } from "../env";
import { first, run, now, toBool } from "./db";
import { UserAccessDeniedException } from "./errors";
import { verifyJwt } from "./jwt";

/** Row of the `user` table, camelCased. Mirrors the User entity. */
export interface AuthUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string | null;
  status: string | null;
  isEnabled: boolean;
  isGoogleSignup: boolean | null;
  isGoogleSignin: boolean | null;
  acceptedTosDetails: string | null;
  lastLoginTime: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  enabledAt: string | null;
}

export function userFromRow(r: Record<string, unknown>): AuthUser {
  return {
    id: r.id as string,
    firstName: (r.first_name as string) ?? null,
    lastName: (r.last_name as string) ?? null,
    email: r.email as string,
    role: (r.role as string) ?? null,
    status: (r.status as string) ?? null,
    isEnabled: toBool(r.is_enabled) ?? true,
    isGoogleSignup: toBool(r.is_google_signup),
    isGoogleSignin: toBool(r.is_google_signin),
    acceptedTosDetails: (r.accepted_tos_details as string) ?? null,
    lastLoginTime: (r.last_login_time as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
    enabledAt: (r.enabled_at as string) ?? null,
  };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<AuthUser | null> {
  const row = await first(db, `SELECT * FROM "user" WHERE email = ?`, email);
  return row ? userFromRow(row) : null;
}

export async function findUserById(db: D1Database, id: string): Promise<AuthUser | null> {
  const row = await first(db, `SELECT * FROM "user" WHERE id = ?`, id);
  return row ? userFromRow(row) : null;
}

/** Paths reachable without authentication (SecurityConfiguration.permitAll). */
function isPublic(path: string): boolean {
  return path === "/auth" || path.startsWith("/auth/") || path === "/health";
}

export function authEnabled(env: Env): boolean {
  return env.AUTH_ENABLED === "true";
}

/**
 * Port of JwtAuthenticationFilter: resolves the current user from a Bearer JWT (or a `tos-` token
 * on /tos/** routes). With AUTH_ENABLED=false every request acts as SYSTEM_USER_EMAIL.
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  c.set("authority", null);
  const path = c.req.path;

  if (!authEnabled(c.env)) {
    const user = await findUserByEmail(c.env.DB, c.env.SYSTEM_USER_EMAIL);
    if (user) {
      c.set("user", user);
      c.set("authority", "AUTH_JWT");
    }
  } else if (path !== "/auth/validate-token") {
    const header = c.req.header("Authorization");
    if (header && header.startsWith("Bearer ") && header.length > 7) {
      const token = header.substring(7);
      if (token.startsWith("tos-")) {
        if (!path.startsWith("/tos/") && path !== "/tos") {
          return c.text("Invalid endpoint for tos- token.", 403);
        }
        const user = await userFromToken(c.env.DB, token.substring(4), c.env.TOS_TOKEN_SIGNING_KEY);
        if (user) {
          checkUserStatus(user);
          c.set("user", user);
          c.set("authority", "AUTH_TOS");
        }
      } else {
        const user = await userFromToken(c.env.DB, token, c.env.TOKEN_SIGNING_KEY);
        if (user) {
          checkUserStatus(user);
          c.set("user", user);
          c.set("authority", "AUTH_JWT");
        }
      }
    }
  }

  if (!isPublic(path) && !c.get("user")) {
    return c.json({ error: "Full authentication is required to access this resource" }, 401);
  }
  await next();
};

async function userFromToken(db: D1Database, token: string, key: string) {
  try {
    const claims = await verifyJwt(token, key);
    return claims.sub ? await findUserByEmail(db, claims.sub) : null;
  } catch {
    // Invalid tokens are ignored, the request continues unauthenticated (same as the Java filter).
    return null;
  }
}

function checkUserStatus(user: AuthUser) {
  if (user.status === "PENDING_DELETION") {
    throw new UserAccessDeniedException("Account is pending deletion and access is not allowed");
  }
}

/** The authenticated user. Only call from routes behind authMiddleware on non-public paths. */
export function currentUser(c: Context<AppEnv>): AuthUser {
  const user = c.get("user");
  if (!user) throw new UserAccessDeniedException("User authentication failed.");
  return user;
}

export async function setLastLoginTime(db: D1Database, userId: string) {
  await run(db, `UPDATE "user" SET last_login_time = ?, updated_at = ? WHERE id = ?`, now(), now(), userId);
}
