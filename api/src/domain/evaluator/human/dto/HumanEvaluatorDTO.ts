/** Port of domain/evaluator/human/dto/HumanEvaluatorDTO (camelCase JSON, nulls written). */
import type { HumanEvaluator } from "../../../../entities/HumanEvaluator";
import type { LinkedEntityType } from "../../../../enums/LinkedEntityType";
import { ScoringMechanismType } from "../../../../enums/ScoringMechanismType";
import { RuntimeException } from "../../../../lib/errors";
import { convertJsonStringToList } from "../../../../util/ObjectMapperUtil";
import { type HumanCategoryOption, normalize } from "./HumanCategoryOption";

export interface HumanEvaluatorDTO {
  id: string | null;
  name: string | null;
  description: string | null;
  scoringMechanismType: ScoringMechanismType | null;
  associatedEntityId: string | null;
  entityType: string | null;
  categories: (HumanCategoryOption | null)[] | null;
  linkedEntityType: LinkedEntityType | null;
}

/** `new HumanEvaluatorDTO(evaluator)`. */
export function fromHumanEvaluator(e: HumanEvaluator): HumanEvaluatorDTO {
  if (e.linkedEntityType == null) {
    // evaluator.getLinkedEntityType().toString() threw a NullPointerException.
    throw new RuntimeException(
      'Cannot invoke "com.planck.planck.enums.LinkedEntityType.toString()" because the return value of "com.planck.planck.entitities.HumanEvaluator.getLinkedEntityType()" is null',
    );
  }
  let categories: (HumanCategoryOption | null)[] | null = null;
  if (e.scoringMechanismType === ScoringMechanismType.CATEGORY) {
    const list = convertJsonStringToList<HumanCategoryOption>(e.categories);
    categories = list == null ? null : list.map(normalize);
  }
  // RANGE: the Java code parsed rangeOptions but did not expose any field (TODO upstream).
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    scoringMechanismType: e.scoringMechanismType,
    associatedEntityId: e.associatedEntityId,
    entityType: e.linkedEntityType,
    categories,
    linkedEntityType: e.linkedEntityType,
  };
}
