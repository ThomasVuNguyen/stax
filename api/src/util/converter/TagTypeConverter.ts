import { TagType, TagTypeValues } from "../../enums/TagType";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<TagType>(TagTypeValues, "TagType");

export function convertToDatabaseColumn(attribute: TagType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): TagType | null {
  return c.convertToEntityAttribute(dbData);
}
