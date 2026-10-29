/** Port of authentication/dto/JwtAuthenticationResponse (all fields are always serialised). */
export interface JwtAuthenticationResponse {
  token: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  tosContent: string | null;
  tosId: string | null;
  status: number;
}

/** `JwtAuthenticationResponse.builder()...build()`: unset fields are null, `status` 0. */
export function build(fields: Partial<JwtAuthenticationResponse>): JwtAuthenticationResponse {
  return {
    token: fields.token ?? null,
    firstName: fields.firstName ?? null,
    lastName: fields.lastName ?? null,
    email: fields.email ?? null,
    tosContent: fields.tosContent ?? null,
    tosId: fields.tosId ?? null,
    status: fields.status ?? 0,
  };
}
