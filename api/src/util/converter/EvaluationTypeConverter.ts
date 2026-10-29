import { EvaluationType, EvaluationTypeValues } from "../../enums/EvaluationType";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<EvaluationType>(EvaluationTypeValues, "EvaluationType");

export function convertToDatabaseColumn(attribute: EvaluationType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): EvaluationType | null {
  return c.convertToEntityAttribute(dbData);
}
