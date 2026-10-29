import { signJwt, verifyJwt, type JwtClaims } from "../lib/jwt";

/**
 * Port of util/JwtTokenUtils over lib/jwt.ts (HS256, jjwt-compatible). `signingKey` is the raw
 * configured secret string (TOKEN_SIGNING_KEY / TOS_TOKEN_SIGNING_KEY); lib/jwt does the base64
 * decoding that getSigningKey() did in Java. UserDetails arguments become the username (email).
 * Parsing errors (bad signature, malformed, expired) throw lib/jwt's JwtError, like jjwt's
 * JwtException / ExpiredJwtException.
 */

export async function extractUserName(token: string, signingKey: string): Promise<string> {
  return extractClaim(token, (c) => c.sub, signingKey);
}

/** Claims = extraClaims + sub + iat + exp (validity in seconds). */
export async function generateToken(
  extraClaims: Record<string, unknown>,
  username: string,
  validity: number,
  signingKey: string,
): Promise<string> {
  return signJwt(username, validity, signingKey, extraClaims);
}

export async function isTokenValid(token: string, username: string, signingKey: string): Promise<boolean> {
  const userName = await extractUserName(token, signingKey);
  return userName === username && !(await isTokenExpired(token, signingKey));
}

export async function extractClaim<T>(
  token: string,
  claimsResolver: (claims: JwtClaims) => T,
  signingKey: string,
): Promise<T> {
  return claimsResolver(await extractAllClaims(token, signingKey));
}

export async function isTokenExpired(token: string, signingKey: string): Promise<boolean> {
  return (await extractExpiration(token, signingKey)).getTime() < Date.now();
}

export async function extractExpiration(token: string, signingKey: string): Promise<Date> {
  return extractClaim(token, (c) => new Date(c.exp * 1000), signingKey);
}

export async function extractAllClaims(token: string, signingKey: string): Promise<JwtClaims> {
  return verifyJwt(token, signingKey);
}

/** Kept for call-site parity: lib/jwt takes the configured secret string directly. */
export function getSigningKey(signingKey: string): string {
  return signingKey;
}
