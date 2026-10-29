/** Port of domain/workbook/dto/WorkBookRowCreateRequest (snake_case JSON). */
import type { Prompt } from "../../../llmproviders/dto/Prompt";

export interface WorkBookRowCreateRequest {
  prompt?: Prompt | null;
  model_id?: string | null;
}
