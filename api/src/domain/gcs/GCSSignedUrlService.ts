/**
 * Port of domain/gcs/GCSSignedUrlService + GCSSignedUrlServiceImpl.
 *
 * Java signed a 15-minute V4 PUT URL for `gs://<bucketId>/<userId>/<objectName>` with the column
 * names as `x-goog-meta-*` headers, for a GCS-triggered processing pipeline. Storage is R2 here and the
 * Worker has no S3 credentials to presign with (and nothing consumes such uploads), so this always
 * takes the Java failure branch: `{ url: null, error: "Error generating signed URL: …" }`, which the
 * controller returns with 500 exactly as before. CSV uploads go through `POST /datasets/{id}/import`.
 */
import type { Ctx } from "../../lib/ctx";
import type { GCSSignedUrlResponseDTO } from "./dto/GCSSignedUrlResponseDTO";

export const SIGNED_URL_EXPIRATION_MINUTES = 15;

export async function generateSignedUrl(
  _ctx: Ctx,
  objectName: string | null,
  user: { id: string | null },
  _inputColumn: string | null,
  _outputColumn: string | null,
  _expectedOutputColumn: string | null,
): Promise<GCSSignedUrlResponseDTO> {
  console.error(`Signed upload URL requested for ${user.id}/${objectName}: not supported on Workers`);
  return {
    url: null,
    error:
      "Error generating signed URL: signed upload URLs are not supported by this deployment (Cloudflare R2 storage);" +
      " upload the file with POST /datasets/{id}/import instead",
  };
}
