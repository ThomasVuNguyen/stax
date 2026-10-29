/**
 * Port of domain/model/dto/ModelDTO. Field names are the JSON names; no NON_NULL, so nulls are
 * emitted. The two Java constructors are:
 * - `fromModel(model)`                                   = `new ModelDTO(model)`
 * - `fromModelWithApiKeys(model, apiKeysPresentSet, pricing)` = `new ModelDTO(model, set, pricing)`
 * For custom endpoints `api_key` is the *encrypted* key stored in the model properties (as in Java).
 */
import { type Model, isCustomEndpoint } from "../../../entities/Model";
import type { ModelProvider } from "../../../enums/ModelProvider";
import type { ModelType } from "../../../enums/ModelType";
import { convertJsonStringToMap } from "../../../util/ObjectMapperUtil";
import { ADDITIONAL_HEADERS, API_KEY_PROPERTY_NAME } from "../../../util/PlanckConstants";

export interface ModelDTO {
  id: string | null;
  name: string | null;
  provider: ModelProvider | null;
  /** @deprecated display name on the UI, same as nickname */
  label: string | null;
  nickname: string | null;
  url: string | null;
  /** `modelTag`, never populated */
  tag: string | null;
  description: string | null;
  comments: string | null;
  properties: Record<string, unknown> | null;
  pricing: Record<string, unknown> | null;
  descriptors: Record<string, unknown> | null;
  is_api_key_present: boolean;
  is_deprecated: boolean;
  model_type: ModelType | null;
  release_date: string | null;
  is_custom_endpoint: boolean | null;
  api_key: string | null;
  additional_headers: Record<string, string> | null;
}

function base(model: Model, pricing: Record<string, unknown> | null): ModelDTO {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    label: model.label,
    nickname: model.label,
    url: model.url,
    tag: null,
    description: model.description,
    comments: model.comments,
    properties: convertJsonStringToMap(model.properties),
    pricing,
    descriptors: convertJsonStringToMap(model.descriptors),
    is_api_key_present: false,
    is_deprecated: model.isDeprecated,
    model_type: model.type,
    release_date: model.releaseDate,
    is_custom_endpoint: isCustomEndpoint(model),
    api_key: null,
    additional_headers: null,
  };
}

/** `setCustomEndpointAttributes(model)`. */
function setCustomEndpointAttributes(dto: ModelDTO, model: Model): ModelDTO {
  if (!dto.is_custom_endpoint) return dto;
  const properties = convertJsonStringToMap(model.properties);
  if (properties != null) {
    if (API_KEY_PROPERTY_NAME in properties) dto.api_key = (properties[API_KEY_PROPERTY_NAME] as string) ?? null;
    if (ADDITIONAL_HEADERS in properties) {
      dto.additional_headers = (properties[ADDITIONAL_HEADERS] as Record<string, string>) ?? null;
    }
  }
  // Always true so custom endpoints show up in drop-downs even when they need no API key.
  dto.is_api_key_present = true;
  return dto;
}

export function fromModel(model: Model): ModelDTO {
  return setCustomEndpointAttributes(base(model, null), model);
}

export function fromModelWithApiKeys(
  model: Model,
  apiKeysPresentSet: ReadonlySet<ModelProvider>,
  pricing: Record<string, unknown> | null,
): ModelDTO {
  const dto = base(model, pricing);
  dto.is_api_key_present = !dto.is_custom_endpoint && model.provider != null && apiKeysPresentSet.has(model.provider);
  return setCustomEndpointAttributes(dto, model);
}
