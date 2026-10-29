/** Port of domain/project/dto/SXSRatingCount (record). */
import type { HumanSxsRating } from "../../../enums/HumanSxsRating";

export interface SXSRatingCount {
  rating: HumanSxsRating;
  count: number;
}
