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
  /**
   * A transaction ON THIS CONNECTION.
   *
   * ⚠️ NEVER expo-sqlite's `withExclusiveTransactionAsync`. It opens a NEW
   * native connection (`Transaction.createAsync` sets `useNewConnection: true`),
   * and a new connection to an ENCRYPTED database has never been given
   * `PRAGMA key` — so it reads the file as noise and fails with "file is not a
   * database". Migration is the first thing that runs, so the offline engine
   * could not start on any phone at all. It is enforced by a test.
   */
  withTransactionAsync(task: (txn: SqlDb) => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}
