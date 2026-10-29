/** Java `Tagable` interface: entities that can be tagged expose `getEntityId()` (= their id). */
export interface Tagable {
  id: string | null;
}

export function getEntityId(e: Tagable): string | null {
  return e.id;
}
