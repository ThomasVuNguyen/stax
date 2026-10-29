import { ScopeType, ScopeTypeValues } from "../../enums/ScopeType";
import { strictEnumConverter } from "./AbstractEnumConverter";

const c = strictEnumConverter<ScopeType>(ScopeTypeValues, "ScopeType", true);

export function convertToDatabaseColumn(attribute: ScopeType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** "" → null; unknown values throw (valueOf). */
export function convertToEntityAttribute(dbData: unknown): ScopeType | null {
  return c.convertToEntityAttribute(dbData);
}
