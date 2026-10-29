import { Role, RoleValues } from "../../enums/Role";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<Role>(RoleValues, "Role");

export function convertToDatabaseColumn(attribute: Role | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): Role | null {
  return c.convertToEntityAttribute(dbData);
}
