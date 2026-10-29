import { CriteriaType, CriteriaTypeValues } from "../../enums/CriteriaType";
import { strictEnumConverter } from "./AbstractEnumConverter";

const c = strictEnumConverter<CriteriaType>(CriteriaTypeValues, "CriteriaType", false);

export function convertToDatabaseColumn(attribute: CriteriaType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values throw (IllegalArgumentException). */
export function convertToEntityAttribute(dbData: unknown): CriteriaType | null {
  return c.convertToEntityAttribute(dbData);
}
