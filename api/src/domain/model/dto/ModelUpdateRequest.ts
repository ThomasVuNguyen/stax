/** Port of domain/model/dto/ModelUpdateRequest (body of PATCH /model/{modelId}); JSON names. */
import { bindObjectMap, bindString, bindStringMap } from "./jsonBinding";

export interface ModelUpdateRequest {
  label: string | null;
  description: string | null;
  comments: string | null;
  descriptors: Record<string, unknown> | null;
  api_key: string | null;
  url: string | null;
  additional_headers: Record<string, string> | null;
}

export function fromJson(body: Record<string, unknown>): ModelUpdateRequest {
  return {
    label: bindString(body.label),
    description: bindString(body.description),
    comments: bindString(body.comments),
    descriptors: bindObjectMap(body.descriptors),
    api_key: bindString(body.api_key),
    url: bindString(body.url),
    additional_headers: bindStringMap(body.additional_headers),
  };
}
