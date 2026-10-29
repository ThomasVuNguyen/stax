import { InvalidDataException } from "../../../lib/errors";
import { normalizeEmail } from "../../../util/Util";

/** Port of authentication/dto/SignUpRequest (not used by any endpoint). */
export interface SignUpRequest {
  firstName: string;
  lastName: string;
  email: string;
}

/** `new SignUpRequest(firstName, lastName, email)` normalises the email. */
export function create(firstName: string, lastName: string, email: string): SignUpRequest {
  return { firstName, lastName, email: normalizeEmail(email) };
}

function nameErrors(field: string, label: string, v: string | null | undefined): string[] {
  if (v == null || v === "") return [`${field}: ${label} can not be empty`];
  const out: string[] = [];
  if (v.length > 40) out.push(`${field}: ${label} length should be between 1 and 40 characters`);
  if (!/^[a-zA-Z0-9]+$/.test(v)) out.push(`${field}: ${label} should be alphanumeric`);
  return out;
}

/** Bean validation of the @NotEmpty/@Length/@Pattern constraints. */
export function validate(r: Partial<SignUpRequest>): SignUpRequest {
  const errors = [...nameErrors("firstName", "First name", r.firstName), ...nameErrors("lastName", "Last name", r.lastName)];
  if (r.email == null || r.email === "") errors.push("email: Email can not be empty");
  else if (r.email.length > 255) errors.push("email: Email length should be between 1 and 255 characters");
  if (errors.length) throw new InvalidDataException(errors.join(", "));
  return r as SignUpRequest;
}
