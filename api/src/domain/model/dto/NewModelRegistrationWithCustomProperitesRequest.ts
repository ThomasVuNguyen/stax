/**
 * Port of domain/model/dto/NewModelRegistrationWithCustomProperitesRequest (body of
 * POST /model/{modelId}/duplicate-and-modify). Field names are the JSON names.
 * `fromJson(body)` binds and type-checks the body like Jackson did (no bean-validation annotations).
 */
import * as ModelPropertyDescriptor from "./ModelPropertyDescriptor";
import { bindObjectMap, bindString } from "./jsonBinding";

export interface NewModelRegistrationWithCustomProperitesRequest {
  new_label: string | null;
  new_description: string | null;
  new_comments: string | null;
  new_descriptors: Record<string, ModelPropertyDescriptor.ModelPropertyDescriptor | null> | null;
  new_properties: Record<string, unknown> | null;
}

export function fromJson(body: Record<string, unknown>): NewModelRegistrationWithCustomProperitesRequest {
  const rawDescriptors = bindObjectMap(body.new_descriptors);
  let descriptors: NewModelRegistrationWithCustomProperitesRequest["new_descriptors"] = null;
  if (rawDescriptors) {
    descriptors = {};
    for (const [k, v] of Object.entries(rawDescriptors)) descriptors[k] = ModelPropertyDescriptor.fromJson(v);
  }
  return {
    new_label: bindString(body.new_label),
    new_description: bindString(body.new_description),
    new_comments: bindString(body.new_comments),
    new_descriptors: descriptors,
    new_properties: bindObjectMap(body.new_properties),
  };
}
