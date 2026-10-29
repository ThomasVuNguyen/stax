/**
 * Port of authentication/AuthenticationController (`/auth/**` is public, see lib/auth.ts).
 * UserPermissionEvaluator is lib/permissions.ts; JwtAuthenticationFilter is lib/auth.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono } from "../../lib/ctx";
import { jsonBody } from "../../lib/http";
import * as JwtTokenUtils from "../../util/JwtTokenUtils";
import * as GoogleAuthCodeRequest from "./dto/GoogleAuthCodeRequest";
import type { TokenValidationResponse } from "./dto/TokenValidationResponse";
import * as GoogleAuthenticationService from "./service/GoogleAuthenticationService";

const app = new Hono<AppEnv>();

app.post("/auth/google/auth-code", async (c) => {
  const ctx = ctxFromHono(c);
  const req = GoogleAuthCodeRequest.validate(await jsonBody<Partial<GoogleAuthCodeRequest.GoogleAuthCodeRequest>>(c));
  return c.json(await GoogleAuthenticationService.validateGoogleAuthCode(ctx, req.authCode, req.redirectUrl));
});

app.get("/auth/health", (c) => c.text("Server is healthy!"));

app.get("/auth/validate-token", async (c) => {
  const authorizationHeader = c.req.header("Authorization");
  if (authorizationHeader == null || authorizationHeader.trim() === "" || !authorizationHeader.startsWith("Bearer ")) {
    return c.json<TokenValidationResponse>({ valid: false, message: "Invalid authorization header format" }, 400);
  }
  const token = authorizationHeader.substring("Bearer ".length);
  try {
    const signingKey = JwtTokenUtils.getSigningKey(c.env.TOKEN_SIGNING_KEY);
    // Like jjwt, parsing an expired token throws, so expired tokens end up as "Invalid token".
    if (await JwtTokenUtils.isTokenExpired(token, signingKey)) {
      return c.json<TokenValidationResponse>({ valid: false, message: "Token is expired" });
    }
    return c.json<TokenValidationResponse>({ valid: true, message: "Token is valid" });
  } catch {
    return c.json<TokenValidationResponse>({ valid: false, message: "Invalid token" });
  }
});

export default app;
