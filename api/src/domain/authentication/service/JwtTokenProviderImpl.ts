/**
 * Port of authentication/service/JwtTokenProviderImpl: HS256 JWTs signed with
 * TOKEN_SIGNING_KEY (auth.jwt.signingKey), valid JWT_VALIDITY_SECONDS (auth.jwt.validity).
 * Parsing failures throw (like jjwt).
 */
import type { Ctx } from "../../../lib/ctx";
import * as JwtTokenUtils from "../../../util/JwtTokenUtils";
import type { UserDetailsLike } from "./TokenProvider";

function validity(ctx: Ctx): number {
  return Number(ctx.env.JWT_VALIDITY_SECONDS || 43200);
}

export async function extractUserName(ctx: Ctx, token: string): Promise<string> {
  return JwtTokenUtils.extractUserName(token, JwtTokenUtils.getSigningKey(ctx.env.TOKEN_SIGNING_KEY));
}

export async function generateToken(
  ctx: Ctx,
  extraClaims: Record<string, unknown>,
  userDetails: UserDetailsLike,
): Promise<string> {
  return JwtTokenUtils.generateToken(
    extraClaims,
    userDetails.email ?? "",
    validity(ctx),
    JwtTokenUtils.getSigningKey(ctx.env.TOKEN_SIGNING_KEY),
  );
}

export async function isTokenValid(ctx: Ctx, token: string, userDetails: UserDetailsLike): Promise<boolean> {
  return JwtTokenUtils.isTokenValid(
    token,
    userDetails.email ?? "",
    JwtTokenUtils.getSigningKey(ctx.env.TOKEN_SIGNING_KEY),
  );
}
