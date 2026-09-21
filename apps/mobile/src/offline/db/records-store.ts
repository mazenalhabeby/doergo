import type { SyncPullResponse } from '@hbcfield/shared/client';
import type { SqlDb } from './sql';

/**
 * The phone's copy of server records, per scope.
 *
 * Only ever written by the sync engine from a pull or a push answer — screens
 * read it, never write it. What a member did that the server has not accepted
 * yet lives in the outbox and is laid over these rows when read, so a guess can
 * never overwrite what the server actually said.
 */
export interface RecordRow<T = unknown> {
  id: string;
  parentId: string | null;
  data: T;
  serverUpdatedAt: string | null;
}

type ChangeListener = (scope: string) => void;

/** Which field of a pulled row names its parent, per scope. */
const PARENT_OF: Record<string, (row: any) => string | null> = {
  comments: (r) => r.taskId ?? null,
  attachments: (r) => r.taskId ?? null,
};

export class RecordsStore {
  private readonly listeners = new Set<ChangeListener>();

  constructor(private readonly db: SqlDb) {}

  /** Told after any write to a scope, so screens reading it can re-read. */
  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(scope: string): void {
    for (const l of this.listeners) l(scope);
  }

  async listByParent<T>(scope: string, parentId: string): Promise<RecordRow<T>[]> {
    const rows = await this.db.getAllAsync<{ id: string; parent_id: string | null; data: string; server_updated_at: string | null }>(
      'SELECT id, parent_id, data, server_updated_at FROM records WHERE scope = ? AND parent_id = ?',
      [scope, parentId],
    );
    return rows.map((r) => ({ id: r.id, parentId: r.parent_id, data: JSON.parse(r.data) as T, serverUpdatedAt: r.server_updated_at }));
  }

  /** Replace every record of a scope under one parent — a task's notes as the API returned them. */
  async replaceChildren(scope: string, parentId: string, rows: { id: string; updatedAt?: string | null }[]): Promise<void> {
    await this.db.withTransactionAsync(async (txn) => {
      await txn.runAsync('DELETE FROM records WHERE scope = ? AND parent_id = ?', [scope, parentId]);
      for (const row of rows) {
        await txn.runAsync(
          'INSERT OR REPLACE INTO records (scope, id, parent_id, data, server_updated_at) VALUES (?, ?, ?, ?, ?)',
          [scope, row.id, parentId, JSON.stringify(row), row.updatedAt ?? null],
        );
      }
    });
    this.changed(scope);
  }

  async list<T>(scope: string): Promise<RecordRow<T>[]> {
    const rows = await this.db.getAllAsync<{ id: string; parent_id: string | null; data: string; server_updated_at: string | null }>(
      'SELECT id, parent_id, data, server_updated_at FROM records WHERE scope = ?',
      [scope],
    );
    return rows.map((r) => ({ id: r.id, parentId: r.parent_id, data: JSON.parse(r.data) as T, serverUpdatedAt: r.server_updated_at }));
  }

  async get<T>(scope: string, id: string): Promise<RecordRow<T> | null> {
    const r = await this.db.getFirstAsync<{ id: string; parent_id: string | null; data: string; server_updated_at: string | null }>(
      'SELECT id, parent_id, data, server_updated_at FROM records WHERE scope = ? AND id = ?',
      [scope, id],
    );
    return r ? { id: r.id, parentId: r.parent_id, data: JSON.parse(r.data) as T, serverUpdatedAt: r.server_updated_at } : null;
  }

  /**
   * Apply one pull page in one transaction: upsert changed rows, remove deleted
   * ones, and — on a reset or the last page — drop anything no longer in scope
   * unless `keep` still needs it (an operation about it is waiting to be sent).
   */
  async applyPull(
    scope: string,
    page: Pick<SyncPullResponse, 'rows' | 'deleted' | 'reset' | 'scopeIds' | 'cursor'>,
    options: { parentOf?: (row: any) => string | null; keep?: ReadonlySet<string>; firstPage: boolean },
  ): Promise<void> {
    await this.db.withTransactionAsync(async (txn) => {
      if (page.reset && options.firstPage) {
        await txn.runAsync('DELETE FROM records WHERE scope = ?', [scope]);
      }
      for (const row of page.rows as { id: string; updatedAt?: string | null }[]) {
        await txn.runAsync(
          'INSERT OR REPLACE INTO records (scope, id, parent_id, data, server_updated_at) VALUES (?, ?, ?, ?, ?)',
          [scope, row.id, (options.parentOf ?? PARENT_OF[scope])?.(row) ?? null, JSON.stringify(row), (row.updatedAt as string | undefined) ?? null],
        );
      }
      for (const id of page.deleted) {
        if (options.keep?.has(id)) continue;
        await txn.runAsync('DELETE FROM records WHERE scope = ? AND id = ?', [scope, id]);
      }
      if (page.scopeIds) {
        const inScope = new Set(page.scopeIds);
        const local = await txn.getAllAsync<{ id: string }>('SELECT id FROM records WHERE scope = ?', [scope]);
        for (const { id } of local) {
          if (!inScope.has(id) && !options.keep?.has(id)) {
            await txn.runAsync('DELETE FROM records WHERE scope = ? AND id = ?', [scope, id]);
          }
        }
      }
      await txn.runAsync(
        'INSERT OR REPLACE INTO sync_state (scope, cursor, last_pull_at) VALUES (?, ?, ?)',
        [scope, page.cursor, Date.now()],
      );
    });
    this.changed(scope);
  }

  /** Replace one record with the server's answer to a push. */
  async upsert(scope: string, row: { id: string; updatedAt?: string | null }, parentId: string | null = null): Promise<void> {
    await this.db.runAsync(
      'INSERT OR REPLACE INTO records (scope, id, parent_id, data, server_updated_at) VALUES (?, ?, ?, ?, ?)',
      [scope, row.id, parentId, JSON.stringify(row), row.updatedAt ?? null],
    );
    this.changed(scope);
  }

  async cursor(scope: string): Promise<{ cursor: string | null; lastPullAt: number | null }> {
    const r = await this.db.getFirstAsync<{ cursor: string | null; last_pull_at: number | null }>(
      'SELECT cursor, last_pull_at FROM sync_state WHERE scope = ?',
      [scope],
    );
    return { cursor: r?.cursor ?? null, lastPullAt: r?.last_pull_at ?? null };
  }
}
