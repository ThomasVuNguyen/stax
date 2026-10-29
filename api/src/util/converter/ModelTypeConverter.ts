import { ModelType, ModelTypeValues } from "../../enums/ModelType";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<ModelType>(ModelTypeValues, "ModelType");

export function convertToDatabaseColumn(attribute: ModelType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): ModelType | null {
  return c.convertToEntityAttribute(dbData);
}
