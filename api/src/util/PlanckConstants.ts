/** Port of util/PlanckConstants. `%d` formats are Java String.format patterns; use formatDefaultName(). */
export const DEFAULT_PROJECT_NAME_FORMAT = "Evaluation %d";
export const DEFAULT_DATASET_NAME_FORMAT = "Untitled %d";
export const DEFAULT_EVALUATOR_CATEGORY_COLOR = "var(--color-secondary)";
export const JOBS_FAILED = "Jobs-Failed";
export const JOBS_STOPPED = "Jobs-Stopped";
export const JOBS_SUCCESSFUL = "Jobs-Successful";
export const JOBS_IN_PROGRESS = "Jobs-In-Progress";
export const JOBS_PENDING = "Jobs-Pending";
export const INFERENCE = "inference";
export const EVAL = "eval";
export const JOBS_DETAILS = "jobs_details";
export const AGGREGATE = "aggregate";
export const BULK = "bulk";
export const DEFAULT_USER_FIRSTNAME = "Default";
export const DEFAULT_USER_LASTNAME = "User";
export const DEFAULT_USER = "default@user.email";
export const MAX_PROJECTS_PER_USER = 50;
// https://cloud.google.com/identity/docs/reference/rest/v1/groups.memberships/checkTransitiveMembership
export const GROUPS_API_URL =
  "https://cloudidentity.googleapis.com/v1/groups/%s/memberships:checkTransitiveMembership";
export const ALLOW_ALL_ALLOWLIST_STRING = "AllUsers";
export const CLOUD_IDENTITY_SCOPE = "https://www.googleapis.com/auth/cloud-identity.groups.readonly";
export const ADDITIONAL_HEADERS = "additional_headers";
export const API_KEY_PROPERTY_NAME = "encrypted_api_key";

/** `String.format(DEFAULT_PROJECT_NAME_FORMAT, n)` and friends: replaces the first `%d` / `%s`. */
export function formatDefaultName(format: string, value: number | string): string {
  return format.replace(/%[ds]/, String(value));
}
