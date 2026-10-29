/** Port of the `PageResult<T>(items, totalSize)` record. */
export interface PageResult<T> {
  items: T[];
  totalSize: number;
}
