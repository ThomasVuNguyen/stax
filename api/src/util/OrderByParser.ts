import type { OrderBy } from "./OrderBy";
import { javaSplit, javaTrim, JAVA_WS } from "./Util";

/** Port of util/OrderByParser: `"name desc, age"` -> [{name, desc:true}, {age, desc:false}]. */
export function parse(orderBy: string | null | undefined): OrderBy[] {
  if (orderBy === null || orderBy === undefined || !orderBy.trim()) return [];
  return javaSplit(orderBy, /,/).map(javaTrim).map(parseSingle);
}

function parseSingle(item: string): OrderBy {
  const parts = javaSplit(javaTrim(item), new RegExp(`${JAVA_WS}+`));
  const field = parts[0] ?? "";
  if (parts.length <= 1) return { field, desc: false };
  return { field, desc: parts[1].toLowerCase() === "desc" };
}
