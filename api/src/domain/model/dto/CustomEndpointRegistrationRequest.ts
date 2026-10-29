/**
 * Port of domain/model/dto/CustomEndpointRegistrationRequest (body of POST /model/custom-endpoint).
 * `fromJson(body)` binds like Jackson; `validate(req)` applies the @NotBlank / @NotNull constraints
 * (@Validated -> MethodArgumentNotValidException -> 400 INVALID_DATA "<javaField>: <message>").
 */
import { ModelProvider, ModelProviderValues } from "../../../enums/ModelProvider";
import { InvalidDataException } from "../../../lib/errors";
import { bindEnum, bindObjectMap, bindString, bindStringMap } from "./jsonBinding";

export interface CustomEndpointRegistrationRequest {
  name: string | null;
  label: string | null;
  url: string | null;
  api_key: string | null;
  supported_provider: ModelProvider | null;
  description: string | null;
  comments: string | null;
  additional_headers: Record<string, string> | null;
  properties: Record<string, unknown> | null;
}

export function fromJson(body: Record<string, unknown>): CustomEndpointRegistrationRequest {
  return {
    name: bindString(body.name),
    label: bindString(body.label),
    url: bindString(body.url),
    api_key: bindString(body.api_key),
    supported_provider: bindEnum(body.supported_provider, ModelProviderValues, "com.planck.planck.enums.ModelProvider"),
    description: bindString(body.description),
    comments: bindString(body.comments),
    additional_headers: bindStringMap(body.additional_headers),
    properties: bindObjectMap(body.properties),
  };
}

const blank = (s: string | null) => s === null || s.trim() === "";

export function validate(req: CustomEndpointRegistrationRequest): void {
  const errors: string[] = [];
  if (blank(req.label)) errors.push("label: Model label is required");
  if (blank(req.url)) errors.push("url: URL is required");
  if (req.supported_provider === null) errors.push("supportedProvider: Supported provider is required");
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}
