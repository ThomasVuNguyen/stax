/**
 * Port of domain/apikeys/service/ApiKeysService + ApiKeysServiceImpl.
 *
 * Keys are stored AES-GCM encrypted (util/EncryptionUtil over lib/crypto, AES_SECRET_KEY).
 * `user` params accept any object with an `id` (entities/User or the request's AuthUser).
 *
 * Overloads: `getApiKeyForUser(ctx, provider, user)` is the ModelProvider variant (returns the
 * *encrypted* key or null); the unimplemented `getApiKeyForUser(String, User)` is
 * `getApiKeyForUserByType` and throws UnsupportedOperationException like Java.
 * `getApiKeyPresentSet` returns a JS Set; `setApiKey`/`deleteApiKey` return the Status200Response
 * JSON `{ message }`.
 */
import type { User } from "../../../entities/User";
import * as ApiKeysEntity from "../../../entities/ApiKeys";
import type { ApiKeys } from "../../../entities/ApiKeys";
import { ModelProvider } from "../../../enums/ModelProvider";
import type { Ctx } from "../../../lib/ctx";
import {
  ApiKeyIsMissingException,
  IllegalInputException,
  RuntimeException,
  UnsupportedOperationException,
} from "../../../lib/errors";
import * as EncryptionUtil from "../../../util/EncryptionUtil";
import * as ApiKeysRepository from "../ApiKeysRepository";
import { type ApiKeysResponseDTO, create as newApiKeysResponseDTO } from "../dto/ApiKeysResponseDTO";

export type UserRef = Pick<User, "id">;

/** com.planck.planck.Status200Response */
export interface Status200Response {
  message: string;
}

const uid = (user: UserRef) => user.id as string;

export async function getApiKeysStatus(ctx: Ctx, user: UserRef): Promise<ApiKeysResponseDTO> {
  const k = await ApiKeysRepository.findByUser(ctx.db, uid(user));
  if (!k) return newApiKeysResponseDTO();
  return newApiKeysResponseDTO({
    openaiKeyPresent: k.openaiKey != null,
    mistralKeyPresent: k.mistralKey != null,
    googleKeyPresent: k.googleKey != null,
    anthropicKeyPresent: k.anthropicKey != null,
    grokKeyPresent: k.grokKey != null,
    ollamaKeyPresent: k.ollamaKey != null,
    deepseekKeyPresent: k.deepseekKey != null,
    huggingfaceKeyPresent: k.huggingfaceKey != null,
    llamaKeyPresent: k.llamaKey != null,
  });
}

/** The user's stored (encrypted) key for the provider, or null. Any failure -> ApiKeyIsMissingException. */
export async function getApiKeyForUser(
  ctx: Ctx,
  type: ModelProvider | null | undefined,
  user: UserRef,
): Promise<string | null> {
  try {
    const db = ctx.db;
    const userId = uid(user);
    switch (type) {
      case ModelProvider.OPENAI:
        return await ApiKeysRepository.findOpenAIKeyByUser(db, userId);
      case ModelProvider.MISTRAL:
        return await ApiKeysRepository.findMistralKeyByUser(db, userId);
      case ModelProvider.ANTHROPIC:
        return await ApiKeysRepository.findAnthropicKeyByUser(db, userId);
      case ModelProvider.GOOGLE:
        return await ApiKeysRepository.findGoogleKeyByUser(db, userId);
      case ModelProvider.GROK:
        return await ApiKeysRepository.findGrokKeyByUser(db, userId);
      case ModelProvider.DEEPSEEK:
        return await ApiKeysRepository.findDeepseekKeyByUser(db, userId);
      case ModelProvider.LLAMA:
        return await ApiKeysRepository.findLlamaKeyByUser(db, userId);
      default:
        console.info("Invalid API key type.");
        throw new ApiKeyIsMissingException("Invalid API key type.");
    }
  } catch (e) {
    console.info("Error fetching API key. Error ::", e);
    throw new ApiKeyIsMissingException("Error fetching API key.");
  }
}

/** Java `getApiKeyForUser(String apiKeyType, User user)`: never implemented. */
export async function getApiKeyForUserByType(_ctx: Ctx, _apiKeyType: string, _user: UserRef): Promise<string> {
  throw new UnsupportedOperationException("Unimplemented method 'getApiKeyForUser'");
}

export async function setApiKey(
  ctx: Ctx,
  user: UserRef,
  modelProvider: ModelProvider | null,
  key: string | null,
): Promise<Status200Response> {
  let encryptedKey: string;
  try {
    encryptedKey = await EncryptionUtil.encrypt(ctx.env, key);
  } catch (e) {
    console.error("Error while encrypting key. ERROR::", e);
    throw new RuntimeException("Error while encrypting key. ERROR:: " + (e instanceof Error ? e.message : String(e)));
  }
  await saveApiKeys(ctx, encryptedKey, modelProvider, user);
  console.info("Api Key Set successfully");
  return { message: "Success" };
}

export async function deleteApiKey(ctx: Ctx, user: UserRef, type: ModelProvider | null): Promise<Status200Response> {
  await saveApiKeys(ctx, null, type, user);
  console.info("API Key deleted successfully");
  return { message: "API Key deleted successfully" };
}

/** Providers the user has a key for (Ollama / HuggingFace are not ModelProviders). */
export async function getApiKeyPresentSet(ctx: Ctx, user: UserRef): Promise<Set<ModelProvider>> {
  const set = new Set<ModelProvider>();
  const k = await ApiKeysRepository.findByUser(ctx.db, uid(user));
  if (k) {
    if (k.openaiKey != null) set.add(ModelProvider.OPENAI);
    if (k.mistralKey != null) set.add(ModelProvider.MISTRAL);
    if (k.googleKey != null) set.add(ModelProvider.GOOGLE);
    if (k.anthropicKey != null) set.add(ModelProvider.ANTHROPIC);
    if (k.grokKey != null) set.add(ModelProvider.GROK);
    if (k.deepseekKey != null) set.add(ModelProvider.DEEPSEEK);
    if (k.llamaKey != null) set.add(ModelProvider.LLAMA);
  }
  return set;
}

export async function deleteByUser(ctx: Ctx, user: UserRef): Promise<void> {
  await ApiKeysRepository.deleteByUser(ctx.db, uid(user));
}

async function saveApiKeys(
  ctx: Ctx,
  apiKey: string | null,
  type: ModelProvider | null,
  user: UserRef,
): Promise<ApiKeys> {
  const apiKeys =
    (await ApiKeysRepository.findByUser(ctx.db, uid(user))) ?? ApiKeysEntity.create({ userId: uid(user) });
  setKeyForProvider(apiKeys, type, apiKey);
  return ApiKeysRepository.saveAndFlush(ctx.db, apiKeys);
}

function setKeyForProvider(apiKeys: ApiKeys, type: ModelProvider | null, apiKey: string | null): void {
  if (type == null) {
    // Java switched on a null enum: NullPointerException -> 500 RUNTIME_ERROR.
    throw new RuntimeException(
      'Cannot invoke "com.planck.planck.enums.ModelProvider.ordinal()" because "type" is null',
    );
  }
  switch (type) {
    case ModelProvider.OPENAI:
      apiKeys.openaiKey = apiKey;
      break;
    case ModelProvider.MISTRAL:
      apiKeys.mistralKey = apiKey;
      break;
    case ModelProvider.GOOGLE:
      apiKeys.googleKey = apiKey;
      break;
    case ModelProvider.ANTHROPIC:
      apiKeys.anthropicKey = apiKey;
      break;
    case ModelProvider.GROK:
      apiKeys.grokKey = apiKey;
      break;
    case ModelProvider.DEEPSEEK:
      apiKeys.deepseekKey = apiKey;
      break;
    case ModelProvider.LLAMA:
      apiKeys.llamaKey = apiKey;
      break;
    default:
      console.error("API Key type is not valid ::", type);
      throw new IllegalInputException("API Key type is not valid:  " + type);
  }
}
