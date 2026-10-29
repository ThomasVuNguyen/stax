/** Port of user/UserController. With AUTH_ENABLED=false every endpoint answers 404 (empty body). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { authEnabled, currentUser } from "../../lib/auth";
import { ctxFromHono } from "../../lib/ctx";
import * as UserDeletionService from "./UserDeletionService";
import * as UserService from "./UserService";

const app = new Hono<AppEnv>();

app.delete("/user/delete-user-data", async (c) => {
  if (!authEnabled(c.env)) return c.body(null, 404);
  const ctx = ctxFromHono(c);
  await UserDeletionService.deleteUserAndAllData(ctx, UserService.fromAuthUser(currentUser(c)));
  return c.body(null, 204);
});

app.get("/user/get-stale-deletion-count", async (c) => {
  if (!authEnabled(c.env)) return c.body(null, 404);
  return c.json(await UserDeletionService.getStaleUserDeletionCount(ctxFromHono(c)));
});

app.post("/user/retry-stale-deletions", async (c) => {
  if (!authEnabled(c.env)) return c.body(null, 404);
  await UserDeletionService.retryStaleUserDeletions(ctxFromHono(c));
  return c.body(null, 204);
});

export default app;
