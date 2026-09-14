/**
 * The offline evidence rules and the outbox outcome table, shared by the phone
 * and the server — so the answer a worker sees offline is the answer the server
 * gives when it arrives.
 */
import {
  assessOccurrence,
  assessFix,
  occurrenceNeedsApproval,
  outboxOutcomeFor,
  outboxOutcomeForResult,
  retryDelayMs,
  OCCURRENCE_RULES,
} from '@hbcfield/shared';

const NOW = new Date('2026-09-14T11:14:00Z');
const min = (n: number) => n * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** A phone that last heard from the server at 07:31 with 16 712 004 ms uptime. */
const anchor = { serverTime: '2026-09-14T07:31:02Z', uptimeMs: 16_712_004 };
const uptimeAt = (atIso: string) => anchor.uptimeMs + (new Date(atIso).getTime() - new Date(anchor.serverTime).getTime());

describe('assessOccurrence', () => {
  it('accepts a clock-in recorded offline at 07:58 with an honest clock', () => {
    const at = '2026-09-14T07:58:12Z';
    const r = assessOccurrence({ occurredAt: at, uptimeMs: uptimeAt(at), anchor }, { now: NOW });
    expect(r.refusal).toBeUndefined();
    expect(r.occurredAt.toISOString()).toBe('2026-09-14T07:58:12.000Z');
    expect(r.flags).toEqual(['RECORDED_OFFLINE']);
    expect(occurrenceNeedsApproval(r.flags)).toBe(false);
  });

  it('flags a phone clock moved back an hour', () => {
    const realAt = '2026-09-14T08:58:00Z';
    const claimed = '2026-09-14T07:58:00Z';
    const r = assessOccurrence({ occurredAt: claimed, uptimeMs: uptimeAt(realAt), anchor }, { now: NOW });
    expect(r.flags).toContain('CLOCK_SUSPECT');
    expect(occurrenceNeedsApproval(r.flags)).toBe(true);
  });

  it('tolerates ordinary drift', () => {
    const realAt = '2026-09-14T08:00:00Z';
    const claimed = iso(new Date(realAt).getTime() + min(3));
    const r = assessOccurrence({ occurredAt: claimed, uptimeMs: uptimeAt(realAt), anchor }, { now: NOW });
    expect(r.flags).not.toContain('CLOCK_SUSPECT');
  });

  it('marks a reboot since the last server contact as unanchored, not suspect', () => {
    const r = assessOccurrence({ occurredAt: '2026-09-14T09:00:00Z', uptimeMs: 5_000, anchor }, { now: NOW });
    expect(r.flags).toContain('UNANCHORED');
    expect(r.flags).not.toContain('CLOCK_SUSPECT');
    expect(occurrenceNeedsApproval(r.flags)).toBe(false);
  });

  it('refuses the future beyond drift tolerance, allows a little', () => {
    expect(assessOccurrence({ occurredAt: iso(NOW.getTime() + min(10)) }, { now: NOW }).refusal?.code).toBe('OCCURRED_IN_FUTURE');
    expect(assessOccurrence({ occurredAt: iso(NOW.getTime() + min(1)) }, { now: NOW }).refusal).toBeUndefined();
  });

  it('refuses an action that precedes the one it follows', () => {
    const r = assessOccurrence({ occurredAt: '2026-09-14T07:00:00Z' }, { now: NOW, previousAt: new Date('2026-09-14T07:58:00Z') });
    expect(r.refusal?.code).toBe('OUT_OF_ORDER');
  });

  it('refuses an unreadable time', () => {
    expect(assessOccurrence({ occurredAt: 'yesterday' }, { now: NOW }).refusal?.code).toBe('OCCURRED_AT_INVALID');
  });

  it('sends a week-old record to a person', () => {
    const r = assessOccurrence({ occurredAt: iso(NOW.getTime() - OCCURRENCE_RULES.STALE_AFTER_MS - min(1)) }, { now: NOW });
    expect(r.flags).toEqual(expect.arrayContaining(['RECORDED_OFFLINE', 'STALE']));
    expect(occurrenceNeedsApproval(r.flags)).toBe(true);
  });

  it('a live action is not "recorded offline"', () => {
    const at = iso(NOW.getTime() - 5_000);
    expect(assessOccurrence({ occurredAt: at, uptimeMs: uptimeAt(at), anchor }, { now: NOW }).flags).toEqual([]);
  });
});

describe('assessFix', () => {
  const at = new Date('2026-09-14T07:58:12Z');
  const good = { lat: 47.9186, lng: 13.7991, accuracy: 9, fixAt: '2026-09-14T07:58:10Z', mocked: false };

  it('accepts a precise fix taken at the tap', () => expect(assessFix(good, at)).toEqual({ ok: true }));
  it.each([
    ['missing', null, 'FIX_MISSING'],
    ['0,0 (the old stand-in for no fix)', { ...good, lat: 0, lng: 0 }, 'FIX_MISSING'],
    ['out of range', { ...good, lat: 123 }, 'FIX_MISSING'],
    ['mocked', { ...good, mocked: true }, 'FIX_MOCKED'],
    ['240 m wide', { ...good, accuracy: 240 }, 'FIX_INACCURATE'],
    ['an hour old', { ...good, fixAt: '2026-09-14T06:58:10Z' }, 'FIX_NOT_AT_TAP'],
  ])('refuses a fix that is %s', (_, fix, code) => {
    expect(assessFix(fix as any, at)).toMatchObject({ ok: false, code });
  });
});

describe('outbox outcomes', () => {
  it.each([
    [201, undefined, 'done'],
    [0, undefined, 'retry'],
    [null, undefined, 'retry'],
    [500, undefined, 'retry'],
    [503, undefined, 'retry'],
    [429, undefined, 'retry'],
    [408, undefined, 'retry'],
    [401, undefined, 'awaiting_auth'],
    [409, 'IDEMPOTENCY_IN_PROGRESS', 'retry'],
    [409, 'TASK_REASSIGNED', 'conflict'],
    [400, undefined, 'failed'],
    [403, undefined, 'failed'],
    [404, undefined, 'failed'],
    [422, 'IDEMPOTENCY_KEY_REUSED', 'failed'],
  ])('HTTP %p %p → %s', (status, code, outcome) => {
    expect(outboxOutcomeFor(status as any, code as any)).toBe(outcome);
  });

  it('maps push results', () => {
    expect(outboxOutcomeForResult({ status: 'replayed' })).toBe('done');
    expect(outboxOutcomeForResult({ status: 'conflict' })).toBe('conflict');
    expect(outboxOutcomeForResult({ status: 'skipped' })).toBe('failed');
    expect(outboxOutcomeForResult({ status: 'retry' })).toBe('retry');
  });

  it('backs off 2 s, 4 s, 8 s … capped at 5 minutes with jitter', () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4].map((n) => retryDelayMs(n, mid))).toEqual([2000, 4000, 8000, 16000]);
    expect(retryDelayMs(50, mid)).toBe(300_000);
    expect(retryDelayMs(1, () => 0)).toBe(1600);
    expect(retryDelayMs(1, () => 1)).toBe(2400);
  });
});
