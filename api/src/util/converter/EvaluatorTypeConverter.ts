import { EvaluatorType, EvaluatorTypeValues } from "../../enums/EvaluatorType";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<EvaluatorType>(EvaluatorTypeValues, "EvaluatorType");

export function convertToDatabaseColumn(attribute: EvaluatorType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): EvaluatorType | null {
  return c.convertToEntityAttribute(dbData);
}
