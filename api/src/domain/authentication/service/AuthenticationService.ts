/**
 * Port of authentication/service/AuthenticationService + SingleUserAuthenticationServiceImpl
 * (only active with auth.singleUser.enabled=true in Java; no endpoint calls it).
 */
import type { Ctx } from "../../../lib/ctx";
import { EmailAlreadyExistsException, IllegalArgumentException, UserAccountDisabledException, UserNotFoundException } from "../../../lib/errors";
import { Role } from "../../../enums/Role";
import * as UserEntity from "../../../entities/User";
import * as UserRepository from "../../user/UserRepository";
import * as UserService from "../../user/UserService";
import { DEFAULT_USER, DEFAULT_USER_FIRSTNAME, DEFAULT_USER_LASTNAME } from "../../../util/PlanckConstants";
import { normalizeEmail } from "../../../util/Util";
import * as JwtAuthenticationResponse from "../dto/JwtAuthenticationResponse";
import * as JwtService from "./JwtService";

export async function signup(
  ctx: Ctx,
  email: string,
  firstName: string,
  lastName: string,
): Promise<JwtAuthenticationResponse.JwtAuthenticationResponse> {
  email = normalizeEmail(email);
  // Only supports authentication with a single user (java.security.InvalidParameterException).
  if (email !== DEFAULT_USER) throw new IllegalArgumentException("Please sign up with the default user account.");
  if (await UserRepository.existsByEmail(ctx.db, email)) throw new EmailAlreadyExistsException(
      "Email Exists: This email is already registered. Please log in or try a different email.",
    );
  const user = UserEntity.createUser(firstName, lastName, email, Role.USER);
  await UserRepository.save(ctx.db, user);
  return JwtAuthenticationResponse.build({ firstName: user.firstName, lastName: user.lastName, email: user.email });
}

export async function signin(ctx: Ctx, email: string): Promise<JwtAuthenticationResponse.JwtAuthenticationResponse> {
  email = normalizeEmail(email);
  if (email !== DEFAULT_USER) throw new IllegalArgumentException("Please sign in with the default user account.");
  // Automatically sign up if user hasn't done so.
  if (!(await UserRepository.existsByEmail(ctx.db, email))) {
    await signup(ctx, DEFAULT_USER, DEFAULT_USER_FIRSTNAME, DEFAULT_USER_LASTNAME);
  }
  const user = await UserRepository.findByEmail(ctx.db, email);
  if (!user) throw new UserNotFoundException(UserService.USER_NOT_FOUND_MESSAGE);
  if (!UserEntity.isEnabled(user)) {
    console.info("User is disabled.");
    throw new UserAccountDisabledException("Account Disabled: Your account is currently disabled.");
  }
  const jwt = await JwtService.generateToken(ctx, user);
  await UserService.setLastLoginTime(ctx, user);
  return JwtAuthenticationResponse.build({
    token: jwt,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  });
}
