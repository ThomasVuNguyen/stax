/** Port of domain/job/dto/APIResponse (@JsonInclude NON_NULL: `data` omitted when absent). */
export interface APIResponse {
  success: boolean;
  message: string | null;
  data?: Record<string, unknown>;
}

/** Java `new APIResponse(success, message, key, value)`. */
export function create(success: boolean, message: string | null, key: string | null, value: unknown): APIResponse {
  const r: APIResponse = { success, message };
  if (key != null && value != null) r.data = { [key]: value };
  return r;
}
