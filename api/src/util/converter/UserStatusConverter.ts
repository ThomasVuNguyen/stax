import { UserStatus, UserStatusValues } from "../../enums/UserStatus";
import { abstractEnumConverter } from "./AbstractEnumConverter";

const c = abstractEnumConverter<UserStatus>(UserStatusValues, "UserStatus");

export function convertToDatabaseColumn(attribute: UserStatus | null | undefined): string | null {
  return c.convertToDatabaseColumn(attribute);
}

/** Unknown values become null (logged), like AbstractEnumConverter. */
export function convertToEntityAttribute(dbData: unknown): UserStatus | null {
  return c.convertToEntityAttribute(dbData);
}
