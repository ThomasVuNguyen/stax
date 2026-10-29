/**
 * Generic string converter (AbstractEnumConverter): stores `name()`, reads with `Enum.valueOf`,
 * returning null (and logging) for unknown values instead of throwing.
 */
export interface EnumConverter<E extends string> {
  convertToDatabaseColumn(attribute: E | null | undefined): string | null;
  convertToEntityAttribute(dbData: unknown): E | null;
}

export function abstractEnumConverter<E extends string>(values: readonly E[], enumName: string): EnumConverter<E> {
  return {
    convertToDatabaseColumn: (attribute) => (attribute === null || attribute === undefined ? null : attribute),
    convertToEntityAttribute: (dbData) => {
      if (dbData === null || dbData === undefined) return null;
      const s = String(dbData);
      if ((values as readonly string[]).includes(s)) return s as E;
      console.error(`Error while converting database value '${s}' to enum of type '${enumName}'`);
      return null;
    },
  };
}

/**
 * Converters that treat "" as null and use `valueOf` (throwing on unknown values):
 * LinkedEntityType, PointScaleDataType, ScopeType, ScoringMechanismType.
 */
export function strictEnumConverter<E extends string>(
  values: readonly E[],
  enumName: string,
  emptyIsNull = true,
): EnumConverter<E> {
  return {
    convertToDatabaseColumn: (attribute) => (attribute === null || attribute === undefined ? null : attribute),
    convertToEntityAttribute: (dbData) => {
      if (dbData === null || dbData === undefined) return null;
      const s = String(dbData);
      if (emptyIsNull && s === "") return null;
      if ((values as readonly string[]).includes(s)) return s as E;
      throw new Error(`No enum constant ${enumName}.${s}`);
    },
  };
}
