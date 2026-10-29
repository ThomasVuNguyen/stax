/** Port of domain/job/dto/BulkInputStatusDTO (snake_case, NON_NULL; `statusId` is @JsonIgnore). */
export interface BulkInputStatusDTO {
  id?: string;
  status?: string;
  message?: string;
  start_time?: string;
  end_time?: string;
  model_name?: string;
  response_id?: string;
  input_id?: string;
  user_id?: string;
  template_id?: string;
  input?: string;
  output?: string;
}

/** Drops null/undefined fields (NON_NULL). */
export function toJson(fields: { [K in keyof BulkInputStatusDTO]?: BulkInputStatusDTO[K] | null }): BulkInputStatusDTO {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) out[k] = v;
  return out as BulkInputStatusDTO;
}
