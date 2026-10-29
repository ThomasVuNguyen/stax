import type { Prompt } from "../../../llmproviders/dto/Prompt";

/** Port of domain/inference/dto/ContinueSxsRequestDTO (@JsonNaming SnakeCase). */
export interface ContinueSxsRequestDTO {
  model_id_a?: string | null;
  model_id_b?: string | null;
  prompts?: Prompt[] | null;
}
