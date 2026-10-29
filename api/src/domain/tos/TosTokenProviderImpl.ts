/**
 * Port of tos/TosTokenProviderImpl: `tos-` prefixed HS256 JWTs signed with TOS_TOKEN_SIGNING_KEY
 * (auth.tos.signingKey), valid TOS_VALIDITY_SECONDS (auth.tos.validity).
 */
import type { Ctx } from "../../lib/ctx";
import * as JwtTokenUtils from "../../util/JwtTokenUtils";
import type { UserDetailsLike } from "../authentication/service/TokenProvider";

const PREFIX = "tos-";

function validity(ctx: Ctx): number {
  return Number(ctx.env.TOS_VALIDITY_SECONDS || 1800);
}

export async function extractUserName(ctx: Ctx, token: string): Promise<string> {
  return JwtTokenUtils.extractUserName(
    token.substring(PREFIX.length),
    JwtTokenUtils.getSigningKey(ctx.env.TOS_TOKEN_SIGNING_KEY),
  );
}

export async function generateToken(
  ctx: Ctx,
  extraClaims: Record<string, unknown>,
  userDetails: UserDetailsLike,
): Promise<string> {
  return (
    PREFIX +
    (await JwtTokenUtils.generateToken(
      extraClaims,
      userDetails.email ?? "",
      validity(ctx),
      JwtTokenUtils.getSigningKey(ctx.env.TOS_TOKEN_SIGNING_KEY),
    ))
  );
}

export async function isTokenValid(ctx: Ctx, token: string, userDetails: UserDetailsLike): Promise<boolean> {
  return JwtTokenUtils.isTokenValid(
    token.substring(PREFIX.length),
    userDetails.email ?? "",
    JwtTokenUtils.getSigningKey(ctx.env.TOS_TOKEN_SIGNING_KEY),
  );
}
