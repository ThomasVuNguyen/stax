import { SXSGenerateOutputsMode } from "../../../enums/SXSGenerateOutputsMode";

/** Port of domain/inference/dto/SXSGenerateOutputsBase (no naming strategy: camelCase JSON). */
export interface SXSGenerateOutputsBase {
  modelA?: string | null;
  modelB?: string | null;
  /** Defaults to MISSING_ONLY when absent from the JSON. */
  mode?: SXSGenerateOutputsMode | null;
}

/** Applies the Java field default (`mode = MISSING_ONLY` unless the JSON set it, even to null). */
export function withDefaults<T extends SXSGenerateOutputsBase>(dto: T): T {
  return "mode" in dto ? dto : { ...dto, mode: SXSGenerateOutputsMode.MISSING_ONLY };
}
