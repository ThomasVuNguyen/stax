/**
 * Port of domain/job/dto/InputStatusDTO (snake_case, @JsonInclude NON_NULL; `statusId` is
 * @JsonIgnore and therefore not part of the JSON shape). Build with `toJson(...)` to drop nulls.
 */
export interface InputStatusDTO {
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
  model_version?: string;
}

/** Drops null/undefined fields (NON_NULL). */
export function toJson(fields: { [K in keyof InputStatusDTO]?: InputStatusDTO[K] | null }): InputStatusDTO {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) out[k] = v;
  return out as InputStatusDTO;
}
