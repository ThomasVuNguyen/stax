/** Port of domain/tags/dto/TagFindResponse. */
import type { TagDTO } from "./TagDTO";

export interface TagFindResponse {
  user_tags: TagDTO[] | null;
  model_tags: TagDTO[] | null;
  dataset_tags: TagDTO[] | null;
}
