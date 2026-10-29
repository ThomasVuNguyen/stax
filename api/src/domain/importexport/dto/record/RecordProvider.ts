import type { DataRecord } from "./DataRecord";

/**
 * Port of domain/importexport/dto/record/RecordProvider. `getRecords(InputStream)` becomes
 * `getRecords(file)` returning all records (the Java Stream was consumed eagerly anyway).
 */
export interface RecordProvider {
  supports(contentType: string | null | undefined): boolean;
  getRecords(file: Blob): Promise<DataRecord[]>;
}

/** java.io.IOException raised while reading the file (BaseImportService wraps it). */
export class IOException extends Error {}

/**
 * Reads the upload as UTF-8 like Java's InputStreamReader (BOM kept). Note that JS `trim()` then strips
 * a BOM from the first CSV header, where Java's `String.trim()` did not (so such a column now matches).
 */
export async function readText(file: Blob): Promise<string> {
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(await file.arrayBuffer());
}
