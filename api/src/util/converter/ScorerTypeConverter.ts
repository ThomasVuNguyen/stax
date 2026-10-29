import { ScorerType, ScorerTypeValues } from "../../enums/ScorerType";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<ScorerType>(ScorerTypeValues, "ScorerType");

export function convertToDatabaseColumn(attribute: ScorerType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): ScorerType | null {
  return c.convertToEntityAttribute(dbData);
}
