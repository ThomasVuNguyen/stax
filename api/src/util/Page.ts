/** Spring Data `Pageable` / `Page` equivalents, serialising like PageImpl does through Jackson. */

export interface SortOrder {
  property: string;
  direction: "ASC" | "DESC";
}

export interface Pageable {
  page: number;
  size: number;
  sort?: SortOrder[];
}

interface SortJson {
  empty: boolean;
  sorted: boolean;
  unsorted: boolean;
}

export interface Page<T> {
  content: T[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    sort: SortJson;
    offset: number;
    paged: boolean;
    unpaged: boolean;
  };
  last: boolean;
  totalPages: number;
  totalElements: number;
  size: number;
  number: number;
  sort: SortJson;
  first: boolean;
  numberOfElements: number;
  empty: boolean;
}

export function pageOf<T>(content: T[], pageable: Pageable, totalElements: number): Page<T> {
  const { page, size } = pageable;
  const sorted = !!pageable.sort?.length;
  const sort = { empty: !sorted, sorted, unsorted: !sorted };
  const totalPages = size > 0 ? Math.ceil(totalElements / size) : 1;
  return {
    content,
    pageable: { pageNumber: page, pageSize: size, sort, offset: page * size, paged: true, unpaged: false },
    last: page + 1 >= totalPages,
    totalPages,
    totalElements,
    size,
    number: page,
    sort,
    first: page === 0,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

export function mapPage<T, R>(p: Page<T>, fn: (t: T) => R): Page<R> {
  return { ...p, content: p.content.map(fn) };
}

/** `LIMIT ? OFFSET ?` values for a pageable. */
export function limitOffset(pageable: Pageable): [number, number] {
  return [pageable.size, pageable.page * pageable.size];
}

/**
 * ORDER BY clause for a pageable. `columns` maps allowed Java property names to SQL expressions;
 * unknown properties are ignored so user input never reaches the SQL.
 */
export function orderBy(pageable: Pageable, columns: Record<string, string>, fallback = ""): string {
  const parts = (pageable.sort ?? [])
    .filter((o) => columns[o.property])
    .map((o) => `${columns[o.property]} ${o.direction}`);
  return parts.length ? `ORDER BY ${parts.join(", ")}` : fallback;
}

/** Parses Spring's `?page=0&size=20&sort=name,desc` request params. */
export function pageableFromQuery(
  query: (name: string) => string | undefined,
  queries: (name: string) => string[] | undefined,
  defaults: Pageable = { page: 0, size: 20 },
): Pageable {
  const page = Number(query("page") ?? defaults.page);
  const size = Number(query("size") ?? defaults.size);
  const sort: SortOrder[] = (queries("sort") ?? []).map((s) => {
    const [property, dir] = s.split(",");
    return { property, direction: dir?.toUpperCase() === "DESC" ? "DESC" : "ASC" };
  });
  return {
    page: Number.isFinite(page) && page >= 0 ? page : defaults.page,
    size: Number.isFinite(size) && size > 0 ? size : defaults.size,
    sort: sort.length ? sort : defaults.sort,
  };
}
