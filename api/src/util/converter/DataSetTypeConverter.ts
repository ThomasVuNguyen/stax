import { DataSetType, DataSetTypeValues } from "../../enums/DataSetType";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<DataSetType>(DataSetTypeValues, "DataSetType");

export function convertToDatabaseColumn(attribute: DataSetType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): DataSetType | null {
  return c.convertToEntityAttribute(dbData);
}
