/** Port of domain/tags/repository/EntityFetcher<DTO>. */
import type { Ctx } from "../../../lib/ctx";

export interface EntityFetcher<DTO = unknown> {
  findAllByIds(ctx: Ctx, ids: string[], user: { id: string | null }): Promise<DTO[]>;
}
