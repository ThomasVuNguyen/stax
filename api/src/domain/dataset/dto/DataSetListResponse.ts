import type { DataSetDTO } from "./DataSetDTO";

/** Port of domain/dataset/dto/DataSetListResponse (snake_case, NON_NULL). */
export interface DataSetListResponse {
  system_data_sets: DataSetDTO[];
  user_data_sets: DataSetDTO[];
  community_data_sets: DataSetDTO[];
}
