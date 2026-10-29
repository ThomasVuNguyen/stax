import { ScoringMechanismType, ScoringMechanismTypeValues } from "../../enums/ScoringMechanismType";
import { strictEnumConverter } from "./AbstractEnumConverter";

const c = strictEnumConverter<ScoringMechanismType>(ScoringMechanismTypeValues, "ScoringMechanismType", true);

export function convertToDatabaseColumn(attribute: ScoringMechanismType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** "" → null; unknown values throw (valueOf). */
export function convertToEntityAttribute(dbData: unknown): ScoringMechanismType | null {
  return c.convertToEntityAttribute(dbData);
}
