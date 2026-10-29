/**
 * Port of domain/importexport/dto/ImportRequest. `MultipartFile` → `Blob` (a `File` from
 * `c.req.parseBody()`, or `new File([...], name, { type })` for server-side imports): `type` is the
 * part's Content-Type, which selects the record provider.
 */
export interface ImportRequest {
  file: Blob;
  /** Only the id is used (AuthUser or the User entity). */
  user: { id: string | null };
}
