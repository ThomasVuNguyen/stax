/**
 * Port of domain/model/service/ModelService + ModelServiceImpl.
 *
 * `user` params accept any object with an `id` (entities/User or the request's AuthUser).
 * Return types: `buildModelMap` -> JS `Map<string, Model>`; DTO-returning methods return the JSON
 * shapes from ../dto. `registerNewModelWithCustomProperties` / `registerCustomEndpoint` take the
 * bound request DTOs (see their `fromJson`).
 */
import * as ModelEntity from "../../../entities/Model";
import { type Model, isCustomEndpoint } from "../../../entities/Model";
import type { User } from "../../../entities/User";
import { ModelType } from "../../../enums/ModelType";
import type { MonitoringType } from "../../../enums/MonitoringType";
import type { Ctx } from "../../../lib/ctx";
import { now } from "../../../lib/db";
import {
  IllegalArgumentException,
  NotFoundException,
  ResourceAlreadyExistsException,
  RuntimeException,
  UserQuotaExceededException,
} from "../../../lib/errors";
import * as EncryptionUtil from "../../../util/EncryptionUtil";
import { convertJsonStringToMap, convertMapToJsonString } from "../../../util/ObjectMapperUtil";
import { ADDITIONAL_HEADERS, API_KEY_PROPERTY_NAME } from "../../../util/PlanckConstants";
import { validateExternalUrl } from "../../../util/UrlSecurityUtil";
import * as ApiKeysService from "../../apikeys/service/ApiKeysService";
import * as ModelRepository from "../ModelRepository";
import type { CustomEndpointRegistrationRequest } from "../dto/CustomEndpointRegistrationRequest";
import { type ModelDTO, fromModel, fromModelWithApiKeys } from "../dto/ModelDTO";
import * as ModelPropertyDescriptor from "../dto/ModelPropertyDescriptor";
import type { NewModelRegistrationWithCustomProperitesRequest } from "../dto/NewModelRegistrationWithCustomProperitesRequest";
import { javaToString } from "../dto/jsonBinding";

export type UserRef = Pick<User, "id">;

const NUM_OF_MODELS_PER_USER = 50;
const uid = (user: UserRef) => user.id as string;

export async function deprecateModel(ctx: Ctx, modelId: string, user: UserRef): Promise<ModelDTO> {
  const model = await ModelRepository.findModelByIdAndUser(ctx.db, modelId, uid(user));
  if (model == null) throw new NotFoundException("Model id does not exist for this user");
  if (model.type !== ModelType.USER) throw new IllegalArgumentException("No User model found for this id");
  model.isDeprecated = true;
  return fromModel(await ModelRepository.saveAndFlush(ctx.db, model));
}

/** Models keyed by `keyExtractor`; on key clashes USER models win, then SYSTEM ones. */
export async function buildModelMap<K = string | null>(
  ctx: Ctx,
  user: UserRef,
  keyExtractor: (m: Model) => K,
): Promise<Map<K, Model>> {
  const map = new Map<K, Model>();
  for (const incoming of await getModelsByUser(ctx, user)) {
    const key = keyExtractor(incoming);
    const existing = map.get(key);
    map.set(key, existing ? resolveModelMerge(existing, incoming) : incoming);
  }
  return map;
}

function resolveModelMerge(existing: Model, incoming: Model): Model {
  if (existing.type === ModelType.USER) return existing;
  if (incoming.type === ModelType.USER) return incoming;
  return existing.type === ModelType.SYSTEM ? existing : incoming;
}

export async function getModelsByUser(ctx: Ctx, user: UserRef): Promise<Model[]> {
  return ModelRepository.findNonDeprecatedUserAndSystemModels(ctx.db, uid(user));
}

export async function getModelsList(
  ctx: Ctx,
  user: UserRef,
  projectId: string | null,
  monitoringType: MonitoringType | null,
): Promise<ModelDTO[]> {
  const [models, apiKeysPresentSet] = await Promise.all([
    ModelRepository.findWithDynamicFilters(ctx.db, uid(user), projectId, monitoringType),
    ApiKeysService.getApiKeyPresentSet(ctx, user),
  ]);
  // Pricing was never implemented (fetchPricing returned null).
  return models.map((model) => fromModelWithApiKeys(model, apiKeysPresentSet, null));
}

export async function updateModel(
  ctx: Ctx,
  modelId: string,
  user: UserRef,
  label: string | null,
  description: string | null,
  comments: string | null,
  descriptors: Record<string, unknown> | null,
  apiKey: string | null,
  apiUrl: string | null,
  customHeaders: Record<string, string> | null,
): Promise<ModelDTO> {
  const model = await ModelRepository.findModelByIdAndUser(ctx.db, modelId, uid(user));
  if (model == null) throw new NotFoundException("Model id does not exist for this user");

  if (label != null) model.label = label;
  if (description != null) model.description = description;
  if (comments != null) model.comments = comments;
  if (descriptors != null) model.descriptors = convertMapToJsonString(descriptors);

  if (isCustomEndpoint(model)) await updateCustomModel(ctx, apiKey, apiUrl, customHeaders, model);

  return fromModel(await ModelRepository.saveAndFlush(ctx.db, model));
}

export async function registerNewModelWithCustomProperties(
  ctx: Ctx,
  request: NewModelRegistrationWithCustomProperitesRequest,
  modelId: string,
  user: UserRef,
): Promise<ModelDTO> {
  const currentModel = await getModelForUser(ctx, user, modelId);
  await validateRegisterNewModelInput(ctx, request, user, currentModel);
  const newModel = constructModelPayload(request, user, currentModel);
  return fromModel(await ModelRepository.save(ctx.db, newModel));
}

/** A non-deprecated SYSTEM model with this id, else the user's own model; NotFoundException otherwise. */
export async function getModelForUser(ctx: Ctx, user: UserRef, modelId: string): Promise<Model> {
  const system = await ModelRepository.findModelByIdAndTypeAndNotDeprecated(ctx.db, modelId, ModelType.SYSTEM);
  if (system != null) return system;
  const model = await ModelRepository.findModelByIdAndUser(ctx.db, modelId, uid(user));
  if (model == null) throw new NotFoundException("No Model found");
  return model;
}

function capitalizeFirstLetter(input: string): string {
  return input ? input.substring(0, 1).toUpperCase() + input.substring(1) : input;
}

function sameJsonValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Current label + " Key=value" for every non-null new property that differs from the descriptor entry. */
function generateDefaultLabelName(
  request: NewModelRegistrationWithCustomProperitesRequest,
  currentModel: Model,
): string {
  let label = String(currentModel.label);
  const newModelProperties = request.new_properties ?? {};
  let existingDescriptors: Record<string, unknown> | null = null;
  if (currentModel.descriptors != null && currentModel.descriptors !== "") {
    existingDescriptors = convertJsonStringToMap(currentModel.descriptors);
  }
  for (const [property, propertyValue] of Object.entries(newModelProperties)) {
    if (propertyValue === null || propertyValue === undefined || existingDescriptors == null) continue;
    // Compared against the descriptor entry itself (an object), as Java did.
    if (sameJsonValue(propertyValue, existingDescriptors[property] ?? null)) continue;
    label += " " + capitalizeFirstLetter(property) + "=" + javaToString(propertyValue);
  }
  return label;
}

async function validateRegisterNewModelInput(
  ctx: Ctx,
  request: NewModelRegistrationWithCustomProperitesRequest,
  user: UserRef,
  _currentModel: Model,
): Promise<void> {
  if (request.new_properties == null) throw new IllegalArgumentException("Model properties is a required field");

  const count = await ModelRepository.countModelsByUserAndType(ctx.db, uid(user), ModelType.USER);
  if (count >= NUM_OF_MODELS_PER_USER) {
    throw new UserQuotaExceededException(`Custom model are limited to ${NUM_OF_MODELS_PER_USER} per user`);
  }
  // Java also had a (user, type, label) uniqueness check here, but it compared the label Strings
  // with `==` (reference equality), so it could never match. It is intentionally not enforced.
}

function constructModelPayload(
  request: NewModelRegistrationWithCustomProperitesRequest,
  user: UserRef,
  currentModel: Model,
): Model {
  const newModel = ModelEntity.createUserModelFrom(currentModel);
  newModel.userId = uid(user);

  const mergedProperties: Record<string, unknown> = {};
  if (isCustomEndpoint(newModel)) {
    const existing = convertJsonStringToMap(currentModel.properties);
    if (existing != null) {
      if (API_KEY_PROPERTY_NAME in existing) mergedProperties[API_KEY_PROPERTY_NAME] = existing[API_KEY_PROPERTY_NAME];
      if (ADDITIONAL_HEADERS in existing) mergedProperties[ADDITIONAL_HEADERS] = existing[ADDITIONAL_HEADERS];
    }
  }
  if (request.new_properties != null) Object.assign(mergedProperties, request.new_properties);
  newModel.properties = convertMapToJsonString(mergedProperties);

  newModel.label = request.new_label ?? generateDefaultLabelName(request, currentModel);
  if (request.new_description != null) newModel.description = request.new_description;
  if (request.new_comments != null) newModel.comments = request.new_comments;

  if (request.new_descriptors != null) {
    // objectMapper.writeValueAsString(Map<String, ModelPropertyDescriptor>)
    const out: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(request.new_descriptors)) out[k] = d ? ModelPropertyDescriptor.toJson(d) : null;
    newModel.descriptors = JSON.stringify(out);
  }
  return newModel;
}

export async function registerCustomEndpoint(
  ctx: Ctx,
  request: CustomEndpointRegistrationRequest,
  user: UserRef,
): Promise<Model> {
  await validateCustomEndpointInput(ctx, request, user);

  const customModel = ModelEntity.create({
    userId: uid(user),
    name: request.name,
    label: request.label,
    provider: request.supported_provider,
    url: request.url,
    type: ModelType.USER,
    description: request.description,
    comments: request.comments,
    releaseDate: now(),
  });

  const properties: Record<string, unknown> = { ...(request.properties ?? {}) };
  if (request.api_key != null && request.api_key !== "") {
    properties[API_KEY_PROPERTY_NAME] = await encryptApiKey(ctx, request.api_key);
  }
  if (request.additional_headers != null) properties[ADDITIONAL_HEADERS] = request.additional_headers;
  customModel.properties = convertMapToJsonString(properties);

  return ModelRepository.save(ctx.db, customModel);
}

async function encryptApiKey(ctx: Ctx, apiKey: string): Promise<string> {
  try {
    return await EncryptionUtil.encrypt(ctx.env, apiKey);
  } catch (e) {
    console.error("Failed to encrypt API key", e);
    throw new RuntimeException("Failed to encrypt API key", { cause: e });
  }
}

async function validateCustomEndpointInput(
  ctx: Ctx,
  request: CustomEndpointRegistrationRequest,
  user: UserRef,
): Promise<void> {
  await validateExternalUrl(request.url);

  const count = await ModelRepository.countModelsByUserAndType(ctx.db, uid(user), ModelType.USER);
  if (count >= NUM_OF_MODELS_PER_USER) {
    throw new UserQuotaExceededException(`Custom models are limited to ${NUM_OF_MODELS_PER_USER} per user`);
  }

  const existingModels = await ModelRepository.findModelsByUserAndNotDeprecated(ctx.db, uid(user));
  if (existingModels.some((m) => m.label === request.label)) {
    throw new ResourceAlreadyExistsException(`A model with label '${request.label}' already exists for this user.`);
  }
}

async function updateCustomModel(
  ctx: Ctx,
  apiKey: string | null,
  apiUrl: string | null,
  customHeaders: Record<string, string> | null,
  model: Model,
): Promise<void> {
  if (apiUrl != null) {
    await validateExternalUrl(apiUrl);
    model.url = apiUrl;
  }
  const properties: Record<string, unknown> = convertJsonStringToMap(model.properties) ?? {};
  if (apiKey != null) properties[API_KEY_PROPERTY_NAME] = await encryptApiKey(ctx, apiKey);
  if (customHeaders != null) properties[ADDITIONAL_HEADERS] = customHeaders;
  model.properties = convertMapToJsonString(properties);
}
