import type { SXSGenerateOutputsBase } from "./SXSGenerateOutputsBase";

/** Port of domain/inference/dto/SXSGenerateOutputs. */
export interface SXSGenerateOutputs extends SXSGenerateOutputsBase {
  /** @NotEmpty(message = "SXS pair IDs are required") */
  sxsPairIds?: string[] | null;
}

/** Bean validation as Spring reported it (MethodArgumentNotValidException "field: message"). */
export function validate(dto: SXSGenerateOutputs): string[] {
  return !dto.sxsPairIds || dto.sxsPairIds.length === 0 ? ["sxsPairIds: SXS pair IDs are required"] : [];
}
