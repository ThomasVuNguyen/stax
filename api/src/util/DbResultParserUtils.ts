/** Port of util/DbResultParserUtils: lenient conversion of raw SQL result values. */

export function getLongFromResult(obj: unknown): number {
  if (obj === null || obj === undefined) return 0;
  if (typeof obj === "bigint") return Number(obj);
  if (typeof obj === "number") return Number.isFinite(obj) ? Math.trunc(obj) : 0;
  if (typeof obj === "string") {
    if (!obj.trim()) {
      console.warn("Empty string provided to getLongFromResult, returning 0L.");
      return 0;
    }
    if (/^[+-]?\d+$/.test(obj)) return Number(obj);
    const d = parseDouble(obj);
    if (d !== null) {
      if (d % 1 !== 0) {
        console.warn(`String '${obj}' parsed as Double has a fractional part (${d}). Lossy conversion to Long; consider if this is intended. Returning truncated long.`);
      }
      return Math.trunc(d);
    }
    console.warn(`Could not parse string '${obj}' as Long or as Double to convert to Long. Returning 0L.`);
    return 0;
  }
  console.warn(`Could not convert object '${String(obj)}' of type ${typeof obj} to Long. Returning 0L.`);
  return 0;
}

export function getDoubleFromResult(obj: unknown): number {
  if (obj === null || obj === undefined) return 0;
  if (typeof obj === "bigint") return Number(obj);
  if (typeof obj === "number") return obj;
  if (typeof obj === "string") {
    if (!obj.trim()) {
      console.warn("Empty string provided to getDoubleFromResult, returning 0.0.");
      return 0;
    }
    const d = parseDouble(obj);
    if (d !== null) return d;
    console.warn(`Could not parse string '${obj}' as Double. Returning 0.0.`);
    return 0;
  }
  console.warn(`Could not convert object '${String(obj)}' of type ${typeof obj} to Double. Returning 0.0.`);
  return 0;
}

function parseDouble(s: string): number | null {
  const t = s.trim();
  if (!/^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)[fFdD]?)$/.test(t)) return null;
  return Number(t.replace(/[fFdD]$/, ""));
}
