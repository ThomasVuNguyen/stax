/** Port of domain/job/dto/GridResponse (snake_case, nulls included). */
export interface GridResponse {
  results: unknown;
  total_records: number | null;
}

export function create(results: unknown = null, totalRecords: number | null = 0): GridResponse {
  return { results, total_records: totalRecords };
}
