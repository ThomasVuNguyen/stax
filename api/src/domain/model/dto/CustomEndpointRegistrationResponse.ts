/**
 * Port of domain/model/dto/CustomEndpointRegistrationResponse: a ModelDTO plus two example curl
 * commands. Java constructor `new CustomEndpointRegistrationResponse(model)` -> `fromModel(model)`.
 */
import type { Model } from "../../../entities/Model";
import { convertJsonStringToMap } from "../../../util/ObjectMapperUtil";
import { type ModelDTO, fromModel as modelDtoFromModel } from "./ModelDTO";
import { javaToString } from "./jsonBinding";

export interface CustomEndpointRegistrationResponse extends ModelDTO {
  curl_example: string;
  curl_example_no_auth: string;
}

function curl(model: Model, properties: Record<string, unknown>, withAuth: boolean): string {
  const additionalHeaders = (properties.additional_headers as Record<string, string> | null | undefined) ?? null;
  let s = "curl -X POST \\\n";
  s += `  '${model.url}' \\\n`;
  s += "  -H 'Content-Type: application/json' \\\n";
  if (withAuth && "encrypted_api_key" in properties) s += "  -H 'Authorization: Bearer YOUR_API_KEY' \\\n";
  if (additionalHeaders != null) {
    for (const [k, v] of Object.entries(additionalHeaders)) s += `  -H '${k}: ${v}' \\\n`;
  }
  s += "  -d '{\n";
  s += `    "model": "${model.name}",\n`;
  s += '    "messages": [\n';
  s += "      {\n";
  s += '        "role": "user",\n';
  s += '        "content": "Hello, how are you?"\n';
  s += "      }\n";
  s += "    ],\n";
  if ("temperature" in properties) s += `    "temperature": ${javaToString(properties.temperature)},\n`;
  if ("max_tokens" in properties) s += `    "max_tokens": ${javaToString(properties.max_tokens)},\n`;
  s += '    "stream": false\n';
  s += "  }'";
  return s;
}

export function fromModel(model: Model): CustomEndpointRegistrationResponse {
  const dto = modelDtoFromModel(model);
  const properties = convertJsonStringToMap(model.properties) ?? {};
  return {
    ...dto,
    curl_example: curl(model, properties, true),
    curl_example_no_auth: curl(model, properties, false),
  };
}
