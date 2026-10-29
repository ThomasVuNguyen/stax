import type { DataSet } from "../../../entities/DataSet";
import { EvaluationType, EvaluationTypeValues } from "../../../enums/EvaluationType";
import { RuntimeException } from "../../../lib/errors";

/**
 * Port of domain/dataset/dto/DataSetDTO (snake_case, @JsonInclude NON_NULL). As a request body
 * `type` defaults to POINTWISE when absent; `created_at` / `updated_at` are output only.
 */
export interface DataSetDTO {
  id?: string | null;
  name?: string | null;
  type?: EvaluationType | null;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** `new DataSetDTO(dataSet)`, serialised (property order and NON_NULL as Jackson wrote it). */
export function from(dataSet: DataSet): DataSetDTO {
  const dto: DataSetDTO = {
    id: dataSet.id,
    name: dataSet.name,
    type: dataSet.evaluationType,
    description: dataSet.description,
    created_at: dataSet.createdAt,
    updated_at: dataSet.updatedAt,
  };
  for (const k of Object.keys(dto) as (keyof DataSetDTO)[]) if (dto[k] == null) delete dto[k];
  return dto;
}

/** Request binding: Jackson left the field initializer (POINTWISE) when `type` was absent. */
export function typeOf(body: DataSetDTO): EvaluationType | null {
  return body.type === undefined ? EvaluationType.POINTWISE : body.type;
}

/**
 * Jackson enum binding of `type`: an unknown value raised HttpMessageNotReadableException, which the
 * RuntimeException handler rendered as 500 RUNTIME_ERROR.
 */
export function validateType(type: unknown): void {
  if (type == null || EvaluationTypeValues.includes(type as EvaluationType)) return;
  throw new RuntimeException(
    `JSON parse error: Cannot deserialize value of type \`com.planck.planck.enums.EvaluationType\` from String "${String(type)}": not one of the values accepted for Enum class: [${EvaluationTypeValues.join(", ")}]`,
  );
}
