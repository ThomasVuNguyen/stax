import { LinkedEntityType, LinkedEntityTypeValues } from "../../enums/LinkedEntityType";
import { strictEnumConverter } from "./AbstractEnumConverter";

const c = strictEnumConverter<LinkedEntityType>(LinkedEntityTypeValues, "LinkedEntityType", true);

export function convertToDatabaseColumn(attribute: LinkedEntityType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** "" → null; unknown values throw (valueOf). */
export function convertToEntityAttribute(dbData: unknown): LinkedEntityType | null {
  return c.convertToEntityAttribute(dbData);
}
