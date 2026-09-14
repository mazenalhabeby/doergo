import type { OutboxOp, OutboxStore } from '../outbox/types';
import type { SqlDb } from './sql';

interface Row {
  id: string; user_id: string; organization_id: string; op: string; lane: string; entity_id: string | null;
  depends_on: string; payload: string; evidence: string | null; state: string; attempts: number;
  next_attempt_at: number | null; last_error: string | null; response: string | null; created_at: number; updated_at: number;
}

const COLUMNS = 'id, user_id, organization_id, op, lane, entity_id, depends_on, payload, evidence, state, attempts, next_attempt_at, last_error, response, created_at, updated_at';

function toRow(op: OutboxOp): (string | number | null)[] {
  return [
    op.id, op.userId, op.organizationId, op.op, op.lane, op.entityId ?? null,
    JSON.stringify(op.dependsOn), JSON.stringify(op.payload), op.evidence ? JSON.stringify(op.evidence) : null,
    op.state, op.attempts, op.nextAttemptAt ?? null, op.lastError ? JSON.stringify(op.lastError) : null,
    op.response === undefined ? null : JSON.stringify(op.response), op.createdAt, op.updatedAt,
  ];
}

function fromRow(r: Row): OutboxOp {
  return {
    id: r.id, userId: r.user_id, organizationId: r.organization_id, op: r.op as OutboxOp['op'], lane: r.lane,
    entityId: r.entity_id ?? undefined, dependsOn: JSON.parse(r.depends_on), payload: JSON.parse(r.payload),
    evidence: r.evidence ? JSON.parse(r.evidence) : undefined, state: r.state as OutboxOp['state'], attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at ?? undefined, lastError: r.last_error ? JSON.parse(r.last_error) : undefined,
    response: r.response ? JSON.parse(r.response) : undefined, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** The outbox, durable: survives the app being killed and the phone restarting. */
export class SqliteOutboxStore implements OutboxStore {
  constructor(private readonly db: SqlDb) {}

  async list(userId: string): Promise<OutboxOp[]> {
    const rows = await this.db.getAllAsync<Row>(`SELECT ${COLUMNS} FROM outbox WHERE user_id = ? ORDER BY created_at, id`, [userId]);
    return rows.map(fromRow);
  }

  async get(id: string): Promise<OutboxOp | null> {
    const row = await this.db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM outbox WHERE id = ?`, [id]);
    return row ? fromRow(row) : null;
  }

  async save(ops: OutboxOp[]): Promise<void> {
    if (!ops.length) return;
    const placeholders = `(${COLUMNS.split(',').map(() => '?').join(', ')})`;
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      for (const op of ops) {
        await txn.runAsync(`INSERT OR REPLACE INTO outbox (${COLUMNS}) VALUES ${placeholders}`, toRow(op));
      }
    });
  }

  async prune(userId: string, before: number): Promise<number> {
    const res = await this.db.runAsync(
      `DELETE FROM outbox WHERE user_id = ? AND state IN ('done', 'discarded') AND updated_at < ?`,
      [userId, before],
    );
    return res.changes;
  }
}
