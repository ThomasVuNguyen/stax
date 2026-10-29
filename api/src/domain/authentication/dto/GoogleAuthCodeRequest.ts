import { InvalidDataException } from "../../../lib/errors";

/** Port of authentication/dto/GoogleAuthCodeRequest. */
export interface GoogleAuthCodeRequest {
  authCode: string;
  redirectUrl: string;
}

/** @Validated: @NotEmpty on both fields (MethodArgumentNotValidException format). */
export function validate(body: Partial<GoogleAuthCodeRequest> | null | undefined): GoogleAuthCodeRequest {
  const errors: string[] = [];
  if (body?.authCode == null || body.authCode === "") errors.push("authCode: Google auth code can not be empty");
  if (body?.redirectUrl == null || body.redirectUrl === "")
    errors.push("redirectUrl: Google auth redirect url can not be empty");
  if (errors.length) throw new InvalidDataException(errors.join(", "));
  return body as GoogleAuthCodeRequest;
}
