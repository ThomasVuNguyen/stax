/** Port of feature/dto/Metadata (record with snake_case JSON names). */
export interface Metadata {
  commit_hash: string | null;
  author: string | null;
  deploy_time_utc: string | null;
}
