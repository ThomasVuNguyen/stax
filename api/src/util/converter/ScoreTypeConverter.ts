import { ScoreType, ScoreTypeValues } from "../../enums/ScoreType";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<ScoreType>(ScoreTypeValues, "ScoreType");

export function convertToDatabaseColumn(attribute: ScoreType | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): ScoreType | null {
  return c.convertToEntityAttribute(dbData);
}
