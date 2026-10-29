import type { DataRecord } from "./DataRecord";
import { IOException, type RecordProvider, readText } from "./RecordProvider";

/**
 * Port of JsonRecordProvider: the file is a JSON array of objects. Nested objects/arrays are returned
 * as their JSON text, scalars with String.valueOf.
 */
export const JsonRecordProvider: RecordProvider = {
  supports(contentType) {
    return (contentType ?? "").toLowerCase() === "application/json";
  },

  async getRecords(file) {
    let data: unknown;
    try {
      data = JSON.parse(await readText(file));
    } catch (e) {
      throw new IOException(e instanceof Error ? e.message : String(e));
    }
    if (!Array.isArray(data)) {
      throw new IOException(
        "Cannot deserialize value of type `java.util.ArrayList<java.util.Map<java.lang.String,java.lang.Object>>` from non-array value",
      );
    }
    for (const item of data) {
      if (item !== null && (typeof item !== "object" || Array.isArray(item))) {
        throw new IOException(
          "Cannot deserialize value of type `java.util.LinkedHashMap<java.lang.String,java.lang.Object>` from non-object value",
        );
      }
    }
    return (data as (Record<string, unknown> | null)[]).map((item, i): DataRecord => ({
      getValue(fieldName) {
        if (item === null) {
          throw new TypeError('Cannot invoke "java.util.Map.get(Object)" because "this.data" is null');
        }
        if (fieldName == null) return null;
        const value = Object.prototype.hasOwnProperty.call(item, fieldName) ? item[fieldName] : null;
        if (value === null || value === undefined) return null;
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      },
      getRecordNumber: () => i + 1,
    }));
  },
};
