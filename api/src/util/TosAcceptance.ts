/**
 * Port of util/TosAcceptance, the element of `user.accepted_tos_details` (a JSON array).
 * User.get/setAcceptedTosDetailsList used a plain `new ObjectMapper()`, which writes
 * java.sql.Timestamp as epoch milliseconds, so `acceptedAt` is a number in the stored JSON.
 */
export interface TosAcceptance {
  tosId: string | null;
  acceptedAt: number | null;
}

/** User.getAcceptedTosDetailsList(): [] for null/empty/invalid JSON. */
export function parseTosAcceptances(json: string | null | undefined): TosAcceptance[] {
  if (!json) return [];
  try {
    const list = JSON.parse(json);
    if (!Array.isArray(list)) return [];
    return list.map((t) => ({
      tosId: t?.tosId ?? null,
      acceptedAt: typeof t?.acceptedAt === "string" ? Date.parse(t.acceptedAt) : (t?.acceptedAt ?? null),
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
}

/** User.setAcceptedTosDetailsList(). */
export function stringifyTosAcceptances(list: TosAcceptance[]): string {
  return JSON.stringify(list.map((t) => ({ tosId: t.tosId, acceptedAt: t.acceptedAt })));
}
