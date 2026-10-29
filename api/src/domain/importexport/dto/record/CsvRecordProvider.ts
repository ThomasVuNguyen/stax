import Papa from "papaparse";
import { RuntimeException } from "../../../../lib/errors";
import type { DataRecord } from "./DataRecord";
import { type RecordProvider, readText } from "./RecordProvider";

/**
 * Port of CsvRecordProvider (opencsv, separator ',', quote '"', no escape char) using papaparse.
 *
 * - Header names are trimmed; on duplicate headers the last column wins. Values are not trimmed.
 * - A missing trailing cell yields null; an empty line is a record whose first cell is "".
 * - papaparse reports a trailing newline as an extra `[""]` row; opencsv does not, so it is dropped.
 * - An unterminated quoted field made opencsv throw while iterating, which escaped the per-record
 *   error handling as RuntimeException("Failed to read or parse CSV row") and rolled the whole import
 *   back; here it is detected before any record is processed, with the same outcome.
 * - Known divergences on malformed input: opencsv also unquoted quotes in the middle of a field
 *   (`ab"c,d"e` → one field) and ignored spaces before an opening quote; papaparse does not (a stray
 *   quote after a closing quote is reported as unterminated and fails the import).
 */
export const CsvRecordProvider: RecordProvider = {
  supports(contentType) {
    return (contentType ?? "").toLowerCase() === "text/csv";
  },

  async getRecords(file) {
    const text = await readText(file);
    if (text === "") return [];
    const parsed = Papa.parse<string[]>(text, {
      delimiter: ",",
      quoteChar: '"',
      escapeChar: '"',
      skipEmptyLines: false,
    });
    if (parsed.errors.some((e) => e.code === "MissingQuotes")) {
      throw new RuntimeException("Failed to read or parse CSV row");
    }
    const rows = parsed.data;
    if (/[\r\n]$/.test(text) && rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
      rows.pop();
    }
    const headers = rows[0];
    if (!headers || headers.length === 0) return [];

    const headerMap = new Map<string, number>();
    headers.forEach((h, i) => headerMap.set(h.trim(), i));

    return rows.slice(1).map((line, i): DataRecord => {
      const recordNumber = i + 2;
      return {
        getValue(fieldName) {
          if (fieldName == null || !headerMap.has(fieldName)) return null;
          const index = headerMap.get(fieldName)!;
          return index < line.length ? line[index] : null;
        },
        getRecordNumber: () => recordNumber,
      };
    });
  },
};
