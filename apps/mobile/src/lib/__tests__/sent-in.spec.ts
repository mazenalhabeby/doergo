import { canTakeBack, contractName, sentIn, type QueuedSend } from '../sent-in';
import type { MyLogEntry, MyProposal } from '../api/assets';

const entry = (id: string, status: MyLogEntry['status'], extra: Partial<MyLogEntry> & { pendingSync?: boolean } = {}) => ({
  id, assetId: 'van', logType: 'fuel', category: 'Fuel', direction: 'OUT' as const, amountCents: 8620, note: null,
  values: null, occurredAt: '2026-09-20T08:00:00Z', status, reviewNote: null, reviewedAt: null, hasReceipt: false, ...extra,
});
const proposal = (id: string, status: MyProposal['status'], extra: Partial<MyProposal> = {}): MyProposal => ({
  id, fields: { registration: 'W-5120 L' }, status, reviewNote: null, reviewedAt: null, createdAssetId: null,
  hasDocument: true, documentKind: 'asset-contract', createdAt: '2026-09-19T08:00:00Z', ...extra,
});
const nameOf = (id: string) => (id === 'van' ? 'Ford Transit' : id === 'press' ? 'Press 4' : null);

describe('sent in — one list, one set of words', () => {
  it('speaks two states in the same words whatever kind it is', () => {
    const list = sentIn({ entries: [entry('a', 'SUBMITTED'), entry('b', 'RECORDED')], expenses: [], proposals: [proposal('p', 'PENDING'), proposal('q', 'ACCEPTED')], queued: [], nameOf });
    expect(new Set(list.map((i) => i.state))).toEqual(new Set(['office', 'accepted']));
  });

  it('shows a receipt and a contract saved with no signal, first', () => {
    const queued: QueuedSend[] = [
      { id: 'q1', op: 'expense.submit', createdAt: Date.parse('2026-09-27T10:00:00Z'), params: { assetId: 'press' }, body: { category: 'Spare parts', amountCents: 4200, occurredAt: '2026-09-25T00:00:00Z' } },
      { id: 'q2', op: 'proposal.raise', createdAt: Date.parse('2026-09-27T11:00:00Z'), body: { fields: { manufacturer: 'VW', model: 'Caddy' } } },
      { id: 'q3', op: 'shift.clock_in', createdAt: 0, body: {} },
    ];
    const list = sentIn({ entries: [entry('a', 'RECORDED', { occurredAt: '2026-09-27T12:00:00Z' })], expenses: [], proposals: [], queued, nameOf });
    expect(list.slice(0, 2).map((i) => [i.kind, i.state, i.about])).toEqual([['contract', 'toSend', 'VW Caddy'], ['receipt', 'toSend', 'Press 4']]);
    expect(list[2]!.state).toBe('accepted');
    expect(list).toHaveLength(3);
  });

  it('carries the office\'s reason', () => {
    const [i] = sentIn({ entries: null, expenses: [], proposals: [proposal('p', 'REJECTED', { reviewNote: ' not ours ' })], queued: [], nameOf });
    expect(i).toMatchObject({ state: 'refused', reason: 'not ours' });
  });

  it('falls back to the receipts list on a server without the logbook', () => {
    const list = sentIn({ entries: null, expenses: [{ id: 'x', assetId: 'press', category: 'Repairs', direction: 'OUT', amountCents: 100, note: null, occurredAt: '2026-09-01T00:00:00Z', status: 'SUBMITTED', reviewNote: null, reviewedAt: null, hasReceipt: false }], proposals: [], queued: [], nameOf });
    expect(list[0]).toMatchObject({ kind: 'receipt', about: 'Press 4', state: 'office' });
  });

  it('reads the reading only off a field with a unit', () => {
    const [i] = sentIn({ entries: [entry('a', 'RECORDED', { values: { litres: 40, odometer: 48210 } })], expenses: [], proposals: [], queued: [], nameOf, unitOf: (_a, _t, f) => (f === 'odometer' ? 'km' : null) });
    expect(i!.reading).toMatch(/^48.?210 km$/);
  });

  it('only what reached the server and is undecided can be taken back', () => {
    const list = sentIn({ entries: [entry('a', 'SUBMITTED'), entry('b', 'SUBMITTED', { pendingSync: true }), entry('c', 'RECORDED')], expenses: [], proposals: [proposal('p', 'PENDING')], queued: [], nameOf });
    const byKey = Object.fromEntries(list.map((i) => [i.key, canTakeBack(i)]));
    expect(byKey).toEqual({ 'e:a': true, 'e:b': false, 'e:c': false, 'p:p': true });
  });

  it('names a contract by what it names', () => {
    expect(contractName({ name: 'Sprinter' })).toBe('Sprinter');
    expect(contractName({ serial: 'SN1' })).toBe('SN1');
    expect(contractName({})).toBeNull();
  });
});
