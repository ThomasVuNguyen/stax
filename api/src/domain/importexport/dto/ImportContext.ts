import type { EvaluationContainer } from "../../../entities/EvaluationContainer";
import type { HumanEvaluator } from "../../../entities/HumanEvaluator";
import type { LLMEvaluator } from "../../../entities/LLMEvaluator";
import type { Model } from "../../../entities/Model";
import type { Tag } from "../../../entities/Tag";
import type { ImportRequest } from "./ImportRequest";

/** Port of the ImportContext record. `tagCache` is mutated while importing (new tags, usedCount). */
export interface ImportContext {
  request: ImportRequest;
  user: { id: string | null };
  sourceContainer: EvaluationContainer;
  tagCache: Map<string, Tag>;
  modelMap: Map<string, Model>;
  defaultHumanEvaluator: HumanEvaluator | null;
  evaluators: LLMEvaluator[];
}
