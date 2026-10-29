/**
 * Port of domain/apikeys/dto/ApiKeysRequestDTO. `fromJson(body)` binds like Jackson;
 * `validate(dto)` applies @NotNull (only on POST /api-keys/set-key, which is @Validated).
 */
import { type ModelProvider, ModelProviderValues } from "../../../enums/ModelProvider";
import { InvalidDataException } from "../../../lib/errors";
import { bindEnum, bindString } from "../../model/dto/jsonBinding";

export interface ApiKeysRequestDTO {
  provider: ModelProvider | null;
  key: string | null;
  /** @deprecated */
  reference: string | null;
}

export function fromJson(body: Record<string, unknown>): ApiKeysRequestDTO {
  return {
    provider: bindEnum(body.provider, ModelProviderValues, "com.planck.planck.enums.ModelProvider"),
    key: bindString(body.key),
    reference: bindString(body.reference),
  };
}

export function validate(dto: ApiKeysRequestDTO): void {
  const errors: string[] = [];
  if (dto.provider === null) errors.push("provider: Provider cannot be null");
  if (dto.key === null) errors.push("key: Key cannot be null");
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}
