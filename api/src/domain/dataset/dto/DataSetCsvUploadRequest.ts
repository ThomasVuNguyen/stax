/**
 * Port of domain/dataset/dto/DataSetCsvUploadRequest (snake_case). No Java endpoint used it; kept for
 * completeness. `file` is the multipart File.
 */
export interface DataSetCsvUploadRequest {
  file?: File | null;
  input_column_name?: string | null;
  output_column_name?: string | null;
  expected_output_column_name?: string | null;
  dataset_name?: string | null;
  dataset_description?: string | null;
}
