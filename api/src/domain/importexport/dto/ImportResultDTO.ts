/**
 * Port of domain/importexport/dto/ImportResultDTO. Jackson used the default (camelCase) names:
 * `{ totalRows, successfulRows, failedRows, errorMessages }`.
 */
export interface ImportResultDTO {
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  errorMessages: string[];
}

/** `new ImportResultDTO()` */
export function create(): ImportResultDTO {
  return { totalRows: 0, successfulRows: 0, failedRows: 0, errorMessages: [] };
}

export function incrementTotalRows(r: ImportResultDTO): void {
  r.totalRows++;
}

export function incrementSuccessfulRows(r: ImportResultDTO): void {
  r.successfulRows++;
}

export function addFailure(r: ImportResultDTO, errorMessage: string, rowNumber: number): void {
  r.failedRows++;
  r.errorMessages.push("Error on row " + rowNumber + ": " + errorMessage);
}
