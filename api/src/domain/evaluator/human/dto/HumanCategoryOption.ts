/** Port of domain/evaluator/human/dto/HumanCategoryOption (camelCase JSON, nulls written). */
export interface HumanCategoryOption {
  categoryName: string | null;
  score: number | null;
  description: string | null;
  id: string | null;
}

/** Jackson round trip: known fields only, in getter order. */
export function normalize(c: Partial<HumanCategoryOption> | null | undefined): HumanCategoryOption | null {
  if (c == null) return null;
  return {
    categoryName: c.categoryName ?? null,
    score: c.score ?? null,
    description: c.description ?? null,
    id: c.id ?? null,
  };
}
