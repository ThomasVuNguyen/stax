/** Port of domain/gcs/dto/GCSSignedUrlResponseDTO (snake_case, nulls are written). */
export interface GCSSignedUrlResponseDTO {
  url: string | null;
  error: string | null;
}
