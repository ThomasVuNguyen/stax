/**
 * Port of authentication/service/MembershipService + MembershipServiceImpl.
 *
 * Allowlist config: AUTH_ALLOWLIST_DOMAINS / AUTH_ALLOWLIST_GROUP_IDS (comma-separated, trimmed,
 * like Spring's String[] binding). Group membership uses the Cloud Identity
 * `checkTransitiveMembership` API. Java authenticated with Application Default Credentials; on
 * Workers the service account key JSON must be provided in the GOOGLE_SERVICE_ACCOUNT_JSON secret
 * (the quota project is GCP_PROJECT_ID, falling back to the key's project_id). Without it every
 * group check returns false (logged), i.e. only the domain allowlist and "AllUsers" work.
 */
import type { Ctx } from "../../../lib/ctx";
import { fromBase64 } from "../../../lib/crypto";
import { ALLOW_ALL_ALLOWLIST_STRING, CLOUD_IDENTITY_SCOPE, GROUPS_API_URL } from "../../../util/PlanckConstants";

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export async function checkEmailIsAllowed(ctx: Ctx, email: string | null): Promise<boolean> {
  const allowlistDomains = splitList(ctx.env.AUTH_ALLOWLIST_DOMAINS);
  const allowlistGroupIds = splitList(ctx.env.AUTH_ALLOWLIST_GROUP_IDS);

  if (allowlistDomains.length === 0 && allowlistGroupIds.length === 0) {
    console.warn(
      "At least one of auth.allowlist.domains and auth.allowlist.group_ids should be configured. Denying user access.",
    );
    return false;
  }
  // 1 - does the group allowlist contain the magic string?
  if (allowlistGroupIds.some((g) => g.trim() === ALLOW_ALL_ALLOWLIST_STRING)) return true;

  // 2 - is the email domain in the domain allowlist?
  if (email == null || email === "") {
    console.warn("checkEmailIsAllowed(email) received an empty email. Denying user access.");
    return false;
  }
  const domainIndex = email.indexOf("@");
  if (domainIndex > 0 && domainIndex < email.length - 1) {
    const domain = email.substring(domainIndex + 1).toLowerCase();
    if (allowlistDomains.some((d) => d.toLowerCase() === domain)) return true;
  }

  // 3 - is the email in one of the groups?
  for (const groupId of allowlistGroupIds) {
    if (await checkGroupMembership(ctx, email, groupId)) return true;
  }
  return false;
}

export async function checkGroupMembership(ctx: Ctx, email: string, groupId: string): Promise<boolean> {
  let url: string | null = null;
  try {
    const sa = serviceAccount(ctx);
    if (!sa) {
      console.warn("GOOGLE_SERVICE_ACCOUNT_JSON is not configured; group membership check denied.");
      return false;
    }
    url =
      GROUPS_API_URL.replace("%s", groupId) + "?query=" + encodeURIComponent("member_key_id == " + email);
    const headers: Record<string, string> = { Authorization: "Bearer " + (await accessToken(sa)) };
    const quotaProject = ctx.env.GCP_PROJECT_ID || sa.project_id;
    if (quotaProject) headers["x-goog-user-project"] = quotaProject;

    const response = await fetch(url, { headers });
    const body = await response.text();
    if (response.ok && body) {
      return (JSON.parse(body) as { hasMembership?: boolean }).hasMembership === true;
    }
    console.error(
      `HTTP error during membership check for URL [${url}]. Status: ${response.status}, Response: ${body}`,
    );
    return false;
  } catch (e) {
    console.error(`Unexpected error during membership check for URL [${url}].`, e);
    return false;
  }
}

// ---- Service-account OAuth (replaces GoogleCredentials.getApplicationDefault()) ----

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function serviceAccount(ctx: Ctx): ServiceAccountKey | null {
  const raw = ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const sa = JSON.parse(raw) as ServiceAccountKey;
  return sa.client_email && sa.private_key ? sa : null;
}

let cachedToken: { email: string; token: string; expiresAt: number } | null = null;

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(sa: ServiceAccountKey): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.email === sa.client_email && cachedToken.expiresAt - 60 > nowSec) {
    return cachedToken.token;
  }
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned =
    b64urlJson({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64urlJson({
      iss: sa.client_email,
      scope: CLOUD_IDENTITY_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(new Uint8Array(sig))}`,
    }),
  });
  if (!res.ok) throw new Error(`Service account token request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { email: sa.client_email, token: json.access_token, expiresAt: nowSec + json.expires_in };
  return json.access_token;
}
