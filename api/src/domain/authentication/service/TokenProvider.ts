import type { Ctx } from "../../../lib/ctx";

/**
 * Port of authentication/service/TokenProvider. Implemented by JwtTokenProviderImpl (this folder)
 * and domain/tos/TosTokenProviderImpl. `UserDetails` becomes anything carrying the username (email).
 */
export interface UserDetailsLike {
  email: string | null;
}

export interface TokenProvider {
  extractUserName(ctx: Ctx, token: string): Promise<string>;
  generateToken(ctx: Ctx, extraClaims: Record<string, unknown>, userDetails: UserDetailsLike): Promise<string>;
  isTokenValid(ctx: Ctx, token: string, userDetails: UserDetailsLike): Promise<boolean>;
}
