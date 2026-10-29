import { ModelProvider, ModelProviderValues } from "../../enums/ModelProvider";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<ModelProvider>(ModelProviderValues, "ModelProvider");

export function convertToDatabaseColumn(attribute: ModelProvider | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): ModelProvider | null {
  return c.convertToEntityAttribute(dbData);
}
