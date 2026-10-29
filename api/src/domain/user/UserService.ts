/**
 * Port of user/UserService + UserServiceImpl.
 * - `findByEmail` returns `User | null` (Java Optional).
 * - `userDetailsService().loadUserByUsername(name)` → `loadUserByUsername(ctx, name)`.
 * - `fromAuthUser(authUser)` converts the request principal (lib/auth AuthUser) to the User entity.
 */
import type { Ctx } from "../../lib/ctx";
import type { AuthUser } from "../../lib/auth";
import { now } from "../../lib/db";
import { UserNotFoundException } from "../../lib/errors";
import * as UserEntity from "../../entities/User";
import type { User } from "../../entities/User";
import * as RoleConverter from "../../util/converter/RoleConverter";
import * as UserStatusConverter from "../../util/converter/UserStatusConverter";
import { type TosAcceptance, parseTosAcceptances, stringifyTosAcceptances } from "../../util/TosAcceptance";
import * as UserRepository from "./UserRepository";

export const USER_NOT_FOUND_MESSAGE =
  "User Not Found: We couldn't find an account with those details. Please check your credentials or sign up.";

export function fromAuthUser(a: AuthUser): User {
  return UserEntity.create({
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    email: a.email,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    lastLoginTime: a.lastLoginTime,
    isGoogleSignup: a.isGoogleSignup,
    isGoogleSignin: a.isGoogleSignin,
    acceptedTosDetails: a.acceptedTosDetails,
    isEnabled: a.isEnabled,
    enabledAt: a.enabledAt,
    status: UserStatusConverter.convertToEntityAttribute(a.status),
    role: RoleConverter.convertToEntityAttribute(a.role),
  });
}

export async function loadUserByUsername(ctx: Ctx, username: string): Promise<User> {
  const user = await UserRepository.findByEmail(ctx.db, username);
  if (!user) throw new UserNotFoundException(USER_NOT_FOUND_MESSAGE);
  return user;
}

export async function findByEmail(ctx: Ctx, email: string): Promise<User | null> {
  return UserRepository.findByEmail(ctx.db, email);
}

export async function loadUserById(ctx: Ctx, userId: string): Promise<User> {
  return findByUserId(ctx, userId);
}

export async function save(ctx: Ctx, user: User): Promise<void> {
  await UserRepository.saveAndFlush(ctx.db, user);
}

export async function existsByEmail(ctx: Ctx, email: string): Promise<boolean> {
  return UserRepository.existsByEmail(ctx.db, email);
}

export async function findByUserId(ctx: Ctx, userId: string): Promise<User> {
  const user = await UserRepository.findById(ctx.db, userId);
  if (!user) throw new UserNotFoundException(USER_NOT_FOUND_MESSAGE);
  return user;
}

export async function setLastLoginTime(ctx: Ctx, user: User): Promise<void> {
  user.lastLoginTime = now();
  await UserRepository.save(ctx.db, user);
}

export async function addTosIdToUser(ctx: Ctx, user: User | null, tosId: string): Promise<void> {
  if (user == null) return;
  const currentTosDetails = parseTosAcceptances(user.acceptedTosDetails);
  currentTosDetails.push({ tosId, acceptedAt: Date.now() });
  user.acceptedTosDetails = stringifyTosAcceptances(currentTosDetails);
  await UserRepository.save(ctx.db, user);
}

export function getTosDetailsForUser(user: User | null): TosAcceptance[] | null {
  return user != null ? parseTosAcceptances(user.acceptedTosDetails) : null;
}
