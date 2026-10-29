/** Port of domain/project/dto/SxsCreateRequest (snake_case JSON). */
import type { Prompt } from "../../../llmproviders/dto/Prompt";

export interface SxsCreateRequest {
  prompt?: Prompt | null;
  expected_output?: string | null;
}
