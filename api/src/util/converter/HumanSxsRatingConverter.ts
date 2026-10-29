import { HumanSxsRating, HumanSxsRatingValues } from "../../enums/HumanSxsRating";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<HumanSxsRating>(HumanSxsRatingValues, "HumanSxsRating");

export function convertToDatabaseColumn(attribute: HumanSxsRating | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): HumanSxsRating | null {
  return c.convertToEntityAttribute(dbData);
}
