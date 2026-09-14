import type { OutboxOp, OutboxStore } from './types';

/** The outbox in memory — for tests, and as the reference behaviour for the SQLite store. */
export class MemoryOutboxStore implements OutboxStore {
  private readonly ops = new Map<string, OutboxOp>();

  async list(userId: string): Promise<OutboxOp[]> {
    return [...this.ops.values()].filter((o) => o.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async get(id: string): Promise<OutboxOp | null> {
    return this.ops.get(id) ?? null;
  }

  async save(ops: OutboxOp[]): Promise<void> {
    for (const op of ops) this.ops.set(op.id, structuredClone(op));
  }

  async prune(userId: string, before: number): Promise<number> {
    let n = 0;
    for (const [id, op] of this.ops) {
      if (op.userId === userId && (op.state === 'done' || op.state === 'discarded') && op.updatedAt < before) {
        this.ops.delete(id);
        n++;
      }
    }
    return n;
  }
}
