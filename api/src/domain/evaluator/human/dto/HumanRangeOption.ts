/** Port of domain/evaluator/human/dto/HumanRangeOption (camelCase JSON). */
import type { HumanEvalRangeDataType } from "../../../../enums/HumanEvalRangeDataType";

export interface HumanRangeOption {
  minValue: number | null;
  maxValue: number | null;
  valueType: HumanEvalRangeDataType | null;
  stepSize: number | null;
  description: string | null;
}

/** Jackson round trip of the request body (unknown properties fail in Java; here they are dropped). */
export function normalize(r: Partial<HumanRangeOption> | null | undefined): HumanRangeOption | null {
  if (r == null) return null;
  return {
    minValue: r.minValue ?? null,
    maxValue: r.maxValue ?? null,
    valueType: r.valueType ?? null,
    stepSize: r.stepSize ?? null,
    description: r.description ?? null,
  };
}
