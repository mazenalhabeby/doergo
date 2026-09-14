/**
 * The subset of expo-sqlite the offline layer uses. Stores depend on this, not
 * on the library, so nothing outside `database.ts` touches the native binding.
 */
export type SqlValue = string | number | null;

export interface SqlDb {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  withExclusiveTransactionAsync(task: (txn: SqlDb) => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}
