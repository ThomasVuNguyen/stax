import { fromBase64 } from "./crypto";

/** HS256 JWTs compatible with the jjwt tokens issued by JwtTokenUtils. */

export interface JwtClaims {
  sub: string;
  iat: number;
  exp: number;
  [claim: string]: unknown;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(enc.encode(JSON.stringify(obj)));
}

/** jjwt decodes the configured key as base64; fall back to raw UTF-8 for non-base64 secrets. */
function keyBytes(signingKey: string): Uint8Array {
  if (/^[A-Za-z0-9+/=_-]+$/.test(signingKey) && signingKey.length % 4 === 0) {
    try {
      return fromBase64(signingKey);
    } catch {
      // not base64
    }
  }
  return enc.encode(signingKey);
}

async function hmacKey(signingKey: string) {
  return crypto.subtle.importKey(
    "raw",
    keyBytes(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(
  subject: string,
  validitySeconds: number,
  signingKey: string,
  extraClaims: Record<string, unknown> = {},
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: "HS256" });
  const payload = b64urlJson({ ...extraClaims, sub: subject, iat, exp: iat + validitySeconds });
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(signingKey), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

export class JwtError extends Error {
  constructor(
    message: string,
    public expired = false,
  ) {
    super(message);
  }
}

/** Verifies signature and expiry; throws JwtError on any failure. */
export async function verifyJwt(token: string, signingKey: string): Promise<JwtClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwtError("Malformed token");
  const [header, payload, sig] = parts;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(signingKey),
    fromBase64(sig),
    enc.encode(`${header}.${payload}`),
  );
  if (!ok) throw new JwtError("Invalid signature");
  let claims: JwtClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64(payload)));
  } catch {
    throw new JwtError("Malformed payload");
  }
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
    throw new JwtError("Token is expired", true);
  }
  return claims;
}
