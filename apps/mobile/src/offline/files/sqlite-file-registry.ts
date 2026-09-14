import type { SqlDb } from '../db/sql';
import type { FileRegistry, StoredFile } from './types';

interface Row {
  id: string; path: string; kind: string; mime: string | null; bytes: number | null; width: number | null;
  height: number | null; taken_at: number | null; state: string; object_key: string | null; created_at: number;
}

const COLUMNS = 'id, path, kind, mime, bytes, width, height, taken_at, state, object_key, created_at';

function fromRow(r: Row): StoredFile {
  return {
    id: r.id, path: r.path, kind: r.kind as StoredFile['kind'], mime: r.mime ?? 'application/octet-stream',
    bytes: r.bytes, width: r.width ?? undefined, height: r.height ?? undefined, takenAt: r.taken_at ?? undefined,
    state: r.state as StoredFile['state'], objectKey: r.object_key ?? undefined, createdAt: r.created_at,
  };
}

/** The files table of the member's encrypted database. */
export class SqliteFileRegistry implements FileRegistry {
  constructor(private readonly db: SqlDb) {}

  async add(f: StoredFile): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO files (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.id, f.path, f.kind, f.mime, f.bytes, f.width ?? null, f.height ?? null, f.takenAt ?? null, f.state, f.objectKey ?? null, f.createdAt],
    );
  }

  async get(id: string): Promise<StoredFile | null> {
    const row = await this.db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM files WHERE id = ?`, [id]);
    return row ? fromRow(row) : null;
  }

  async markUploaded(id: string, objectKey: string): Promise<void> {
    await this.db.runAsync(`UPDATE files SET state = 'uploaded', object_key = ? WHERE id = ?`, [objectKey, id]);
  }

  async remove(id: string): Promise<StoredFile | null> {
    const existing = await this.get(id);
    if (existing) await this.db.runAsync('DELETE FROM files WHERE id = ?', [id]);
    return existing;
  }
}

/** The same, in memory — for tests. */
export class MemoryFileRegistry implements FileRegistry {
  readonly rows = new Map<string, StoredFile>();

  async add(f: StoredFile) {
    this.rows.set(f.id, { ...f });
  }
  async get(id: string) {
    const f = this.rows.get(id);
    return f ? { ...f } : null;
  }
  async markUploaded(id: string, objectKey: string) {
    const f = this.rows.get(id);
    if (f) this.rows.set(id, { ...f, state: 'uploaded', objectKey });
  }
  async remove(id: string) {
    const f = this.rows.get(id) ?? null;
    this.rows.delete(id);
    return f;
  }
}
