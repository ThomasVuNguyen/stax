/** Port of domain/project/dto/SXSPointEvaluationDTO. */
import type { LLMEvaluationDTO } from "../../evaluation/dto/LLMEvaluationDTO";
import { javaDoubleToString } from "../../workbook/dto/BaseWorkbookRowDTO";

export interface SXSPointEvaluationDTO {
  chatTurnA: LLMEvaluationDTO | null;
  chatTurnB: LLMEvaluationDTO | null;
  delta: string;
}

/** Double.parseDouble: trims, rejects empty / non-numeric input. */
function parseJavaDouble(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^[+-]?(NaN|Infinity)$/.test(t)) return Number(t.replace(/^\+/, ""));
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?$/.test(t)) return null;
  return Number(t.replace(/[fFdD]$/, ""));
}

/** `new SXSPointEvaluationDTO(a, b)` (calculateDelta: "N/A" unless both scores are numeric). */
export function create(chatTurnA: LLMEvaluationDTO | null, chatTurnB: LLMEvaluationDTO | null): SXSPointEvaluationDTO {
  let delta = "N/A";
  if (chatTurnA?.score != null && chatTurnB?.score != null) {
    const a = parseJavaDouble(chatTurnA.score);
    const b = parseJavaDouble(chatTurnB.score);
    if (a != null && b != null) delta = javaDoubleToString(a - b);
  }
  return { chatTurnA, chatTurnB, delta };
}
