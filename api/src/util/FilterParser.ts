import { RuntimeException } from "../lib/errors";
import type { FilterCondition } from "./FilterCondition";
import { javaSplit, javaTrim, JAVA_WS } from "./Util";

/**
 * Port of util/FilterParser: `name = "x" AND age > 3` -> conditions. Same regex as Java
 * (`(\w+)\s*(=|!=|<|<=|>|>=|:)?\s*"?([^"]+)"?`, whole-string match); `\s` is restricted to the ASCII
 * whitespace Java's default `\s` matches.
 */
const CONDITION_PATTERN = new RegExp(
  `^(?:(\\w+)${JAVA_WS}*(=|!=|<|<=|>|>=|:)?${JAVA_WS}*"?([^"]+)"?)$`,
  "i",
);
const AND_SPLIT = new RegExp(`${JAVA_WS}+AND${JAVA_WS}+`, "i");

export function parse(filter: string | null | undefined): FilterCondition[] {
  if (filter === null || filter === undefined || !filter.trim()) return [];
  return javaSplit(filter, AND_SPLIT).map(javaTrim).map(parseSingle);
}

function parseSingle(condition: string): FilterCondition {
  const m = CONDITION_PATTERN.exec(condition);
  if (!m) {
    // java.lang.IllegalArgumentException -> rendered by the RuntimeException handler.
    throw new RuntimeException(`Invalid filter condition: ${condition}`);
  }
  return { field: m[1], op: m[2] ?? "=", value: m[3] };
}
