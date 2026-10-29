/** Port of authentication/service/JwtService + JwtServiceImpl (delegates to JwtTokenProviderImpl). */
import type { Ctx } from "../../../lib/ctx";
import * as JwtTokenProviderImpl from "./JwtTokenProviderImpl";
import type { UserDetailsLike } from "./TokenProvider";

export async function extractUserName(ctx: Ctx, token: string): Promise<string> {
  return JwtTokenProviderImpl.extractUserName(ctx, token);
}

export async function generateToken(ctx: Ctx, userDetails: UserDetailsLike): Promise<string> {
  return JwtTokenProviderImpl.generateToken(ctx, {}, userDetails);
}

export async function isTokenValid(ctx: Ctx, token: string, userDetails: UserDetailsLike): Promise<boolean> {
  return JwtTokenProviderImpl.isTokenValid(ctx, token, userDetails);
}
