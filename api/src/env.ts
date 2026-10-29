import type { JobMessage } from "./lib/queue";
import type { AuthUser } from "./lib/auth";

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  JOBS: Queue<JobMessage>;

  AUTH_ENABLED: string;
  SYSTEM_USER_EMAIL: string;
  APP_ENV: string;
  JWT_VALIDITY_SECONDS: string;
  TOS_VALIDITY_SECONDS: string;

  AES_SECRET_KEY: string;
  TOKEN_SIGNING_KEY: string;
  TOS_TOKEN_SIGNING_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_ALLOWLIST_DOMAINS?: string;
  AUTH_ALLOWLIST_GROUP_IDS?: string;
  TOS_TYPE?: string;
  /** Service account key JSON (secret) for Cloud Identity group-membership checks (allowlist groups). */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  /** Quota project for Cloud Identity calls (spring.cloud.gcp.projectId); defaults to the key's project_id. */
  GCP_PROJECT_ID?: string;
}

/** Authority attached to the request, mirroring the Spring Security CustomAuthority values. */
export type Authority = "AUTH_JWT" | "AUTH_TOS";

export interface Variables {
  user: AuthUser | null;
  authority: Authority | null;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
