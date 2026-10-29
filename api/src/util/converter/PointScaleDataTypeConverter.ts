import { HumanEvalRangeDataType, HumanEvalRangeDataTypeValues } from "../../enums/HumanEvalRangeDataType";
import { strictEnumConverter } from "./AbstractEnumConverter";

const c = strictEnumConverter<HumanEvalRangeDataType>(HumanEvalRangeDataTypeValues, "HumanEvalRangeDataType", true);

export function convertToDatabaseColumn(attribute: HumanEvalRangeDataType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** "" → null; unknown values throw (valueOf). */
export function convertToEntityAttribute(dbData: unknown): HumanEvalRangeDataType | null {
  return c.convertToEntityAttribute(dbData);
}
