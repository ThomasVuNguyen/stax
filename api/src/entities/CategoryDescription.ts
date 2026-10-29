/** @Embeddable value object (no table). Serialised with these exact JSON names. */
export interface CategoryDescription {
  reference: string;
  name: string;
  description: string;
}

export function toJson(e: CategoryDescription): Record<string, unknown> {
  return { reference: e.reference, name: e.name, description: e.description };
}

/** Bean-validation messages of the Java class (@NotNull/@NotEmpty), in field order. */
export function validate(e: Partial<CategoryDescription> | null | undefined): string[] {
  const errors: string[] = [];
  for (const f of ["reference", "name", "description"] as const) {
    const v = e?.[f];
    if (v === null || v === undefined) errors.push(`${f} can't be null`);
    else if (v === "") errors.push(`${f} can't be empty`);
  }
  return errors;
}

/** Java toString(). */
export function toString(e: CategoryDescription): string {
  return `CategoryDescription{reference='${e.reference}', name='${e.name}', description='${e.description}'}`;
}
