/**
 * Port of domain/workbook/dto/GetWorkbookResponseDTO (AIP-132 list response).
 * `new GetWorkbookResponseDTO(rows, nextPageToken, totalElements)` → `create(...)`.
 * `empty_columns` always starts with "tags" (rows have no tags yet when the constructor runs);
 * TagResponseEnrichmentAdvice removed it once tags were found → `removeTagsFromEmptyColumns`.
 */
import type { ChatWorkbookRowDTO } from "./ChatWorkbookRowDTO";

export interface GetWorkbookResponseDTO {
  workbook_rows: ChatWorkbookRowDTO[];
  next_page_token: string | null;
  total_size: number | null;
  empty_columns: string[];
}

export function create(
  workbookDTO: ChatWorkbookRowDTO[],
  nextPageToken: string | null,
  totalElements: number,
): GetWorkbookResponseDTO {
  const emptyColumns: string[] = [];
  if (!workbookDTO.some((row) => row.system_instructions != null)) emptyColumns.push("system_instructions");
  if (!workbookDTO.some((row) => row.expected_output != null)) emptyColumns.push("expected_output");
  if (!workbookDTO.some((row) => row.variables != null && Object.keys(row.variables).length > 0)) {
    emptyColumns.push("variables");
  }
  if (!workbookDTO.some((row) => row.tags != null && row.tags.length > 0)) emptyColumns.push("tags");
  return { workbook_rows: workbookDTO, next_page_token: nextPageToken, total_size: totalElements, empty_columns: emptyColumns };
}

export function removeTagsFromEmptyColumns(dto: GetWorkbookResponseDTO): void {
  dto.empty_columns = dto.empty_columns.filter((c) => c !== "tags");
}
