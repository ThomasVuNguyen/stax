import type { FilterCondition } from "./FilterCondition";
import type { OrderBy } from "./OrderBy";
import type { PageResult } from "./PageResult";
import { parseJavaDouble } from "./NumberUtil";

/**
 * Port of util/StreamQueryUtils: in-memory filter / sort / paginate over DTOs.
 *
 * Java resolved names through @JsonProperty on the first item's class; TS DTOs already use the
 * JSON names as keys, so a field is "known" when the first item has that own property (unknown
 * fields are skipped, as in Java). Values are compared by their JS type: numbers numerically
 * (Java threw ClassCastException for Integer fields and treated the item as not matching; numbers
 * now just compare), strings by UTF-16 order, booleans false < true, Dates / ISO timestamps by time.
 */
export function filterSortPaginateWithTotal<T extends object>(
  items: T[],
  filters: FilterCondition[],
  orderByList: OrderBy[],
  page: number,
  size: number,
): PageResult<T> {
  if (items.length === 0) return { items: [], totalSize: 0 };
  const known = (name: string) => Object.prototype.hasOwnProperty.call(items[0], name);
  const get = (item: T, name: string) => (item as Record<string, unknown>)[name];

  const filtered = items
    .filter((item) => {
      for (const f of filters) {
        if (!known(f.field)) continue;
        try {
          if (!evaluateCondition(get(item, f.field), f.op, f.value)) return false;
        } catch (e) {
          console.error("Error during filter evaluation", e);
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      for (const o of orderByList) {
        if (!known(o.field)) continue;
        // Comparator.nullsLast(naturalOrder()), the whole comparator reversed for desc.
        const c = nullsLastCompare(get(a, o.field), get(b, o.field));
        if (c !== 0) return o.desc ? -c : c;
      }
      return 0;
    });

  return { items: filtered.slice(page * size, page * size + size), totalSize: filtered.length };
}

function nullsLastCompare(x: unknown, y: unknown): number {
  const xn = x === null || x === undefined;
  const yn = y === null || y === undefined;
  if (xn || yn) return xn && yn ? 0 : xn ? 1 : -1;
  return compare(coerceToComparable(x), coerceToComparable(y));
}

type Comparable = string | number | boolean | Date;

function compare(a: Comparable, b: Comparable): number {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if (typeof av !== typeof bv) throw new Error("ClassCastException: incomparable values");
  return av < bv ? -1 : av > bv ? 1 : 0;
}

export function evaluateCondition(actual: unknown, operator: string, filterValue: string): boolean {
  if (actual === null || actual === undefined) return false;
  const left = coerceToComparable(actual);
  const right = coerceFilterValue(filterValue, left);
  if (right === null) return false;
  if (operator === ":") {
    return typeof left === "string" && typeof right === "string"
      ? left.toLowerCase().includes(right.toLowerCase())
      : false;
  }
  if (!["=", "!=", ">", ">=", "<", "<="].includes(operator)) return false;
  let c: number;
  try {
    c = compare(left, right);
  } catch {
    return false;
  }
  switch (operator) {
    case "=":
      return c === 0;
    case "!=":
      return c !== 0;
    case ">":
      return c > 0;
    case ">=":
      return c >= 0;
    case "<":
      return c < 0;
    default:
      return c <= 0;
  }
}

export function coerceToComparable(value: unknown): Comparable {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  if (typeof value === "bigint") return Number(value);
  return String(value);
}

/** coerceToComparable(raw, targetType): parse the filter string as the type of the field value. */
function coerceFilterValue(raw: string, target: Comparable): Comparable | null {
  try {
    if (typeof target === "number") return parseJavaDouble(raw);
    if (typeof target === "boolean") return raw.toLowerCase() === "true";
    if (target instanceof Date) {
      const t = Date.parse(raw);
      return Number.isNaN(t) ? raw : new Date(t);
    }
  } catch {
    // unparsable -> raw string, which then fails the comparison (ClassCastException in Java)
  }
  return raw;
}
