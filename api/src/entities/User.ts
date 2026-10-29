import { bool, newId, toBool } from "../lib/db";
import type { Role } from "../enums/Role";
import { UserStatus } from "../enums/UserStatus";
import * as RoleConverter from "../util/converter/RoleConverter";
import * as UserStatusConverter from "../util/converter/UserStatusConverter";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "user";
export const ID_PREFIX = "user-";

/**
 * Shape of util/TosAcceptance stored in `accepted_tos_details`. Java wrote it with a plain
 * `new ObjectMapper()`, so `acceptedAt` (java.sql.Timestamp) is epoch millis.
 */
export interface TosAcceptanceJson {
  tosId: string | null;
  acceptedAt: number | string | null;
}

export interface User {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginTime: string | null;
  isGoogleSignup: boolean | null;
  isGoogleSignin: boolean | null;
  /** Raw JSON text (Java has no getter/setter; use get/setAcceptedTosDetailsList). */
  acceptedTosDetails: string | null;
  isEnabled: boolean | null;
  /** @CreationTimestamp */
  enabledAt: string | null;
  status: UserStatus | null;
  role: Role | null;
}

export const COLUMNS: Record<keyof User, string> = {
  id: "id",
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  createdAt: "created_at",
  updatedAt: "updated_at",
  lastLoginTime: "last_login_time",
  isGoogleSignup: "is_google_signup",
  isGoogleSignin: "is_google_signin",
  acceptedTosDetails: "accepted_tos_details",
  isEnabled: "is_enabled",
  enabledAt: "enabled_at",
  status: "status",
  role: "role",
};

/** Defaults of the no-arg constructor: isGoogleSignup/isGoogleSignin false, isEnabled true. */
export function create(init: Partial<User> = {}): User {
  return {
    id: null,
    firstName: null,
    lastName: null,
    email: null,
    createdAt: null,
    updatedAt: null,
    lastLoginTime: null,
    isGoogleSignup: false,
    isGoogleSignin: false,
    acceptedTosDetails: null,
    isEnabled: true,
    enabledAt: null,
    status: null,
    role: null,
    ...init,
  };
}

/** Java `new User(firstName, lastName, email, role[, isGoogleSignup])`: status ACTIVE. */
export function createUser(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
  role: Role | null,
  isGoogleSignup = false,
): User {
  return create({ firstName, lastName, email, role, isGoogleSignup, status: UserStatus.ACTIVE });
}

export function prePersist(e: User): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

/** UserDetails.getUsername() = email. */
export function getUsername(e: User): string | null {
  return e.email;
}

/** UserDetails.getAuthorities(): one authority named after the role. */
export function getAuthorities(e: User): string[] {
  return e.role ? [e.role] : [];
}

/** UserDetails.isEnabled() (unboxes the Boolean). */
export function isEnabled(e: User): boolean {
  return e.isEnabled === true;
}

export function getAcceptedTosDetailsList(e: User): TosAcceptanceJson[] {
  if (e.acceptedTosDetails == null || e.acceptedTosDetails === "") return [];
  try {
    const v = JSON.parse(e.acceptedTosDetails);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function setAcceptedTosDetailsList(e: User, tosAcceptances: TosAcceptanceJson[]): void {
  e.acceptedTosDetails = JSON.stringify(tosAcceptances);
}

export function fromRow(row: Row): User {
  return {
    id: str(row.id),
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    email: str(row.email),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    lastLoginTime: str(row.last_login_time),
    isGoogleSignup: toBool(row.is_google_signup),
    isGoogleSignin: toBool(row.is_google_signin),
    acceptedTosDetails: str(row.accepted_tos_details),
    isEnabled: toBool(row.is_enabled),
    enabledAt: str(row.enabled_at),
    status: UserStatusConverter.convertToEntityAttribute(row.status),
    role: RoleConverter.convertToEntityAttribute(row.role),
  };
}

/** `status` is NOT NULL (DEFAULT 'ACTIVE') in the schema; a null status is written as ACTIVE. */
export function toRow(e: User): Record<string, Param> {
  return {
    id: e.id,
    first_name: e.firstName,
    last_name: e.lastName,
    email: e.email,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    last_login_time: e.lastLoginTime,
    is_google_signup: bool(e.isGoogleSignup),
    is_google_signin: bool(e.isGoogleSignin),
    accepted_tos_details: e.acceptedTosDetails,
    is_enabled: bool(e.isEnabled),
    enabled_at: e.enabledAt,
    status: UserStatusConverter.convertToDatabaseColumn(e.status) ?? UserStatus.ACTIVE,
    role: RoleConverter.convertToDatabaseColumn(e.role),
  };
}

/**
 * The Java User was never serialised whole (getPassword() throws). This is the safe scalar view
 * with the Lombok/UserDetails property names.
 */
export function toJson(e: User): Record<string, unknown> {
  return {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    lastLoginTime: e.lastLoginTime,
    isGoogleSignup: e.isGoogleSignup,
    isGoogleSignin: e.isGoogleSignin,
    isEnabled: e.isEnabled,
    enabledAt: e.enabledAt,
    status: e.status,
    role: e.role,
    username: e.email,
    authorities: getAuthorities(e).map((authority) => ({ authority })),
    accountNonExpired: true,
    accountNonLocked: true,
    credentialsNonExpired: true,
    enabled: isEnabled(e),
    acceptedTosDetailsList: getAcceptedTosDetailsList(e),
  };
}
