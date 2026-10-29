/** Port of domain/gcs/dto/GCSSignedUrlRequestDTO (snake_case). */
export interface GCSSignedUrlRequestDTO {
  object_name?: string | null;
  input_column?: string | null;
  output_column?: string | null;
  expected_output_column?: string | null;
}
