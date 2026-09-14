import { boundedCounts, renderMetrics, type StoredHealth } from '../sync-health.store';

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;
const report = (over: Partial<StoredHealth>): StoredHealth => ({
  userId: 'u', organizationId: 'org-a', receivedAt: now, appVersion: '1.0.6', waiting: 0, attention: 0,
  oldestWaitingAt: null, byState: {}, codes: {}, filesWaiting: 0, bytesWaiting: 0, lastSuccessAt: null, ...over,
});

describe('offline sync metrics', () => {
  it('sums phones per organization and counts members with work stuck a day', () => {
    const text = renderMetrics(
      [
        report({ userId: 'u1', waiting: 3, bytesWaiting: 1200, oldestWaitingAt: now - DAY - 1 }),
        report({ userId: 'u2', waiting: 1, attention: 2, oldestWaitingAt: now - 60_000 }),
        report({ userId: 'u3', organizationId: 'org-b' }),
      ],
      { applied: '41', conflict: '2' },
      now,
    );
    expect(text).toContain('hbc_offline_devices_reporting{organization="org-a"} 2');
    expect(text).toContain('hbc_offline_ops_waiting{organization="org-a"} 4');
    expect(text).toContain('hbc_offline_ops_attention{organization="org-a"} 2');
    expect(text).toContain('hbc_offline_members_stuck{organization="org-a"} 1');
    expect(text).toContain('hbc_offline_members_stuck{organization="org-b"} 0');
    expect(text).toContain('hbc_offline_bytes_waiting{organization="org-a"} 1200');
    expect(text).toContain('hbc_sync_push_results_total{status="conflict"} 2');
    // Members are never labels.
    expect(text).not.toMatch(/u1|u2|u3/);
  });

  it('escapes a label value and bounds what a phone may store', () => {
    expect(renderMetrics([report({ organizationId: 'a"b\\c' })], {}, now)).toContain('organization="a\\"b\\\\c"');
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`CODE_${i}`, i]));
    expect(Object.keys(boundedCounts({ ...many }))).toHaveLength(20);
    expect(boundedCounts({ ok: 2, bad: -1, nan: Number.NaN, ['x'.repeat(61)]: 1 })).toEqual({ ok: 2 });
  });
});

describe('the metrics endpoint', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SyncController } = require('../sync.controller') as typeof import('../sync.controller');
  const build = (token?: string) =>
    new SyncController({} as any, {} as any, { metrics: async () => 'hbc 1\n' } as any, { get: () => token } as any);

  it('does not exist without METRICS_TOKEN', async () => {
    await expect(build(undefined).metrics({ headers: {} })).rejects.toMatchObject({ status: 404 });
  });

  it('answers only the token', async () => {
    const c = build('s3cret-token');
    await expect(c.metrics({ headers: { authorization: 'Bearer wrong-token!' } })).rejects.toMatchObject({ status: 401 });
    await expect(c.metrics({ headers: {} })).rejects.toMatchObject({ status: 401 });
    await expect(c.metrics({ headers: { authorization: 'Bearer s3cret-token' } })).resolves.toBe('hbc 1\n');
  });
});

describe('the Phone sync tab', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { memberHealthView } = require('../sync-health.store') as typeof import('../sync-health.store');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { syncHealthState, SYNC_SILENT_AFTER_MS } = require('@hbcfield/shared') as typeof import('@hbcfield/shared');
  const HOUR = 60 * 60 * 1000;

  it('names each state, most urgent first, in one rule', () => {
    const at = (over: Partial<StoredHealth>) => ({ waiting: 0, attention: 0, oldestWaitingAt: null, receivedAt: now, ...over });
    expect(syncHealthState(at({}), now)).toBe('up_to_date');
    expect(syncHealthState(at({ waiting: 2, oldestWaitingAt: now - HOUR }), now)).toBe('sending');
    expect(syncHealthState(at({ attention: 1 }), now)).toBe('needs_member');
    // Not reaching the server outranks waiting on the member: only the first is lost with the phone.
    expect(syncHealthState(at({ waiting: 5, attention: 1, oldestWaitingAt: now - DAY }), now)).toBe('stuck');
    // A silent phone's numbers are old news.
    expect(syncHealthState(at({ waiting: 5, oldestWaitingAt: now - 9 * DAY, receivedAt: now - SYNC_SILENT_AFTER_MS }), now)).toBe('silent');
  });

  it("shows only this organization's reports, sorted, and survives a corrupt entry", () => {
    const rows = memberHealthView(
      [
        JSON.stringify(report({ userId: 'fine' })),
        JSON.stringify(report({ userId: 'moved-away', organizationId: 'org-b', waiting: 9, oldestWaitingAt: now - 2 * DAY })),
        JSON.stringify(report({ userId: 'sending', waiting: 1, oldestWaitingAt: now - HOUR })),
        null,
        '{not json',
        JSON.stringify(report({ userId: 'stuck', waiting: 3, oldestWaitingAt: now - 2 * DAY })),
      ],
      'org-a',
      now,
    );
    expect(rows.map((r) => [r.userId, r.state])).toEqual([['stuck', 'stuck'], ['sending', 'sending'], ['fine', 'up_to_date']]);
    expect(rows[0]).not.toHaveProperty('organizationId');
  });

  it('is gated on canManageUsers', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SyncController } = require('../sync.controller') as typeof import('../sync.controller');
    const route = SyncController.prototype.memberHealth;
    const metadata = Reflect.getMetadataKeys(route).map((k) => Reflect.getMetadata(k, route));
    expect(JSON.stringify(metadata)).toContain('canManageUsers');
  });

  it("reads the caller's organization from the token", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SyncController } = require('../sync.controller') as typeof import('../sync.controller');
    const asked: string[] = [];
    const c = new SyncController({} as any, {} as any, { forOrganization: async (org: string) => (asked.push(org), []) } as any, {} as any);
    await c.memberHealth({ user: { organizationId: 'org-a' }, query: { organizationId: 'org-b' }, body: { organizationId: 'org-b' } });
    expect(asked).toEqual(['org-a']);
  });
});
