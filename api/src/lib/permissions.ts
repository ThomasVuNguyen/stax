import type { Ctx } from "./ctx";
import { requireUser } from "./ctx";
import { first } from "./db";
import { UnauthorizedException } from "./errors";

/**
 * Port of UserPermissionEvaluator for `@PreAuthorize("hasPermission(#projectId, 'PROJECT', ...)")`:
 * access is granted when the project exists and is owned by the current user. When the project
 * does not exist Spring fell back to authority matching, which never matched, so access is denied.
 * Spring rendered AccessDeniedException as 401 `{ "error": "Access Denied" }`.
 */
export async function assertProjectAccess(ctx: Ctx, projectId: string, _permission: "read" | "write") {
  const user = requireUser(ctx);
  const row = await first<{ user_id: string }>(
    ctx.db,
    `SELECT user_id FROM evaluation_container WHERE id = ?`,
    projectId,
  );
  if (!row || row.user_id !== user.id) throw new UnauthorizedException("Access Denied");
}
