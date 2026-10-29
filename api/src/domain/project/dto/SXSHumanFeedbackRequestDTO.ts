/** Port of domain/project/dto/SXSHumanFeedbackRequestDTO (no bean-validation constraints). */
import type { HumanSxsRating } from "../../../enums/HumanSxsRating";

export interface SXSHumanFeedbackRequestDTO {
  notes?: string | null;
  rating?: HumanSxsRating | null;
  chat_turn_a_id?: string | null;
  chat_turn_b_id?: string | null;
}
