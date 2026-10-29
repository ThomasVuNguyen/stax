import type { HumanSxsRating } from "../../../enums/HumanSxsRating";

/** Port of domain/importexport/dto/SXSHumanEvalRatingExportDTO (default camelCase JSON, nulls kept). */
export interface SXSHumanEvalRatingExportDTO {
  sequenceId: number | null;
  rating: HumanSxsRating | null;
  notes: string | null;
}
