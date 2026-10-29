/** Port of authentication/service/MembershipAuthorizer (`@membershipAuthorizer` in @PreAuthorize). */
import type { Ctx } from "../../../lib/ctx";
import * as MembershipService from "./MembershipService";

export async function isMemberOf(ctx: Ctx, groupId: string): Promise<boolean> {
  if (!ctx.user) return false;
  return MembershipService.checkGroupMembership(ctx, ctx.user.email, groupId);
}

export async function isMemberOfAny(ctx: Ctx, ...groupIds: string[]): Promise<boolean> {
  if (!ctx.user) return false;
  for (const groupId of groupIds) {
    if (await MembershipService.checkGroupMembership(ctx, ctx.user.email, groupId)) return true;
  }
  return false;
}
