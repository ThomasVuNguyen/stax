/** Port of domain/importexport/dto/record/DataRecord. */
export interface DataRecord {
  /** Value of the column/property, null when the name is null or not present. */
  getValue(fieldName: string | null | undefined): string | null;
  /** 1-based data row number (CSV: header is row 1, so the first record is 2). */
  getRecordNumber(): number;
}
