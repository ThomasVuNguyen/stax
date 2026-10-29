/**
 * Port of authentication/service/GoogleAuthenticationService.
 *
 * The auth code is exchanged with `fetch` at https://oauth2.googleapis.com/token (client id/secret
 * from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). As with GoogleTokenResponse.parseIdToken(), the
 * returned id_token is only decoded, not signature-verified: it comes straight from Google over TLS.
 */
import type { Ctx } from "../../../lib/ctx";
import { userFromRow } from "../../../lib/auth";
import { fromBase64 } from "../../../lib/crypto";
import { GoogleAuthCodeException, PermissionException } from "../../../lib/errors";
import { now } from "../../../lib/db";
import { Role } from "../../../enums/Role";
import { UserStatus } from "../../../enums/UserStatus";
import * as UserEntity from "../../../entities/User";
import type { User } from "../../../entities/User";
import { normalizeEmail } from "../../../util/Util";
import * as UserService from "../../user/UserService";
import * as ProjectService from "../../project/ProjectService";
import * as PointwiseHeuristicEvaluatorService from "../../evaluator/heuristic/service/PointwiseHeuristicEvaluatorService";
import * as HumanEvaluatorService from "../../evaluator/human/service/HumanEvaluatorService";
import * as JwtAuthenticationResponse from "../dto/JwtAuthenticationResponse";
import * as JwtService from "./JwtService";
import * as MembershipService from "./MembershipService";

interface IdTokenPayload {
  email?: string;
  name?: string;
  [claim: string]: unknown;
}

export async function validateGoogleAuthCode(
  ctx: Ctx,
  authCode: string,
  redirectUrl: string,
): Promise<JwtAuthenticationResponse.JwtAuthenticationResponse> {
  const payload = await exchangePayloadFromGoogleAuthCode(ctx, authCode, redirectUrl);
  const email = normalizeEmail(payload.email ?? "");

  if (!(await MembershipService.checkEmailIsAllowed(ctx, email))) {
    throw new PermissionException("Access denied. Email address is not allowed.");
  }
  const user = await UserService.findByEmail(ctx, email);
  if (user) return doSignin(ctx, user);
  return doSignup(ctx, (payload.name as string | undefined) ?? null, email);
}

export async function doSignin(ctx: Ctx, user: User): Promise<JwtAuthenticationResponse.JwtAuthenticationResponse> {
  user.lastLoginTime = now();
  user.isGoogleSignin = true;
  if (!UserEntity.isEnabled(user)) {
    throw new GoogleAuthCodeException("Your Stax account is disabled.");
  }
  if (user.status === UserStatus.PENDING_DELETION) {
    throw new GoogleAuthCodeException("Your Stax account is pending deletion.");
  }
  await UserService.save(ctx, user);
  return generateJwtAuthenticationResponse(ctx, user);
}

export async function doSignup(
  ctx: Ctx,
  firstName: string | null,
  email: string,
): Promise<JwtAuthenticationResponse.JwtAuthenticationResponse> {
  if (firstName == null || firstName.trim() === "") firstName = "User";
  const parts = firstName.trim().split(" ");
  let actualFirstName: string;
  let actualLastName: string;
  if (parts.length === 0 || parts[0] === "") {
    actualFirstName = "User";
    actualLastName = "";
  } else if (parts.length === 1) {
    actualFirstName = parts[0];
    actualLastName = "";
  } else {
    actualFirstName = parts[0];
    actualLastName = parts.slice(1).join(" ").trim();
  }

  const user = UserEntity.createUser(actualFirstName, actualLastName, email, Role.USER, true);
  await UserService.save(ctx, user);
  // The signup runs on the public /auth route: the new user (as the request principal type) is
  // passed to the setup services and also exposed as the context principal.
  const authUser = userFromRow(UserEntity.toRow(user));
  const userCtx: Ctx = { ...ctx, user: authUser };
  await HumanEvaluatorService.createUserThumbsEvaluator(userCtx, authUser);
  await PointwiseHeuristicEvaluatorService.createDefaultHeuristicEvaluators(userCtx, authUser);
  await ProjectService.createDefaultProject(userCtx, authUser);
  return doSignin(ctx, user);
}

export async function generateJwtAuthenticationResponse(
  ctx: Ctx,
  user: User,
): Promise<JwtAuthenticationResponse.JwtAuthenticationResponse> {
  const jwt = await JwtService.generateToken(ctx, user);
  return JwtAuthenticationResponse.build({
    token: jwt,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  });
}

async function exchangePayloadFromGoogleAuthCode(
  ctx: Ctx,
  authCode: string,
  redirectUrl: string,
): Promise<IdTokenPayload> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUrl,
        client_id: ctx.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: ctx.env.GOOGLE_CLIENT_SECRET ?? "",
        access_type: "online",
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body}`);
    const idToken = (JSON.parse(body) as { id_token?: string }).id_token;
    const parts = idToken?.split(".") ?? [];
    if (parts.length < 2) throw new Error("Missing id_token in Google token response");
    return JSON.parse(new TextDecoder().decode(fromBase64(parts[1]))) as IdTokenPayload;
  } catch (e) {
    console.error(`Error exchanging Google Auth Code: ${(e as Error).message}`, e);
    throw new GoogleAuthCodeException("INVALID GOOGLE AUTHCODE");
  }
}
