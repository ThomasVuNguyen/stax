/** Port of domain/workbook/dto/SXSWorkbookDTO (AIP-132 list response for SxS rows). */
import type { SXSChatRowDTO } from "../../project/dto/SXSChatRowDTO";

export interface SXSWorkbookDTO {
  sxs_rows: SXSChatRowDTO[];
  next_page_token: string | null;
  total_size: number | null;
}

/** `new SXSWorkbookDTO(sxsRows, nextPageToken, totalElements)`. */
export function create(sxsRows: SXSChatRowDTO[], nextPageToken: string | null, totalElements: number): SXSWorkbookDTO {
  return { sxs_rows: sxsRows, next_page_token: nextPageToken, total_size: totalElements };
}
