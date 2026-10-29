/** Port of domain/evaluator/dto/EvaluatorVariableDTO (@JsonInclude NON_NULL; `required` is a primitive). */
export interface EvaluatorVariableDTO {
  name?: string | null;
  required: boolean;
}

export function normalize(v: Partial<EvaluatorVariableDTO> | null | undefined): EvaluatorVariableDTO | null {
  if (v == null) return null;
  const out = {} as EvaluatorVariableDTO;
  if (v.name != null) out.name = v.name;
  out.required = !!v.required;
  return out;
}

export function normalizeList(list: (Partial<EvaluatorVariableDTO> | null)[] | null | undefined): (EvaluatorVariableDTO | null)[] | null {
  return list == null ? null : list.map(normalize);
}
