/** Port of domain/job/dto/JobStatusDTO (snake_case, @JsonInclude NON_NULL). */
import type { InputStatusDTO } from "./InputStatusDTO";

export interface JobStatusDTO {
  status?: string;
  job_id?: string;
  type?: string;
  start_time?: string;
  end_time?: string;
  input_ids?: InputStatusDTO[];
  pending?: number;
  in_progress?: number;
  failed?: number;
  successful?: number;
  total?: number;
}

/** Drops null/undefined fields (NON_NULL). */
export function toJson(fields: { [K in keyof JobStatusDTO]?: JobStatusDTO[K] | null }): JobStatusDTO {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) out[k] = v;
  return out as JobStatusDTO;
}
