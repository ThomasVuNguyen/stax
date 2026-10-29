/** Port of domain/evaluator/human/dto/HumanRangeOptionTbc. */
import type { ScoreValueType } from "../../../../enums/ScoreValueType";

export interface HumanRangeOptionTbc {
  minValue: number | null;
  maxValue: number | null;
  valueType: ScoreValueType | null;
}
