/**
 * Check-ins kept while the phone has no signal.
 */
import { CHECK_IN_BUFFER_KEY, MAX_KEPT, MAX_KEPT_AGE_MS, createCheckInBuffer, type KeptCheckIn } from '../../services/check-in-buffer';

const NOW = Date.parse('2026-09-14T11:40:00.000Z');

function setup(behaviour: 'ok' | 'offline' | 'refused' = 'ok') {
  const mem = new Map<string, string>();
  const sent: KeptCheckIn[][] = [];
  const offlineError = Object.assign(new Error('Network request failed'), { statusCode: 0 });
  const buffer = createCheckInBuffer({
    storage: {
      getItem: async (k) => mem.get(k) ?? null,
      setItem: async (k, v) => void mem.set(k, v),
      removeItem: async (k) => void mem.delete(k),
    },
    send: async (points) => {
      if (behaviour === 'offline') throw offlineError;
      if (behaviour === 'refused') throw Object.assign(new Error('Not found'), { statusCode: 404 });
      sent.push(points);
    },
    isUnreachable: (e) => (e as { statusCode?: number }).statusCode === 0,
    now: () => NOW,
  });
  return { buffer, mem, sent, setBehaviour: (b: typeof behaviour) => (behaviour = b) };
}

const point = (minutesAgo: number): KeptCheckIn => ({ lat: 47.98, lng: 13.82, recordedAt: new Date(NOW - minutesAgo * 60_000).toISOString() });

describe('kept check-ins', () => {
  it('keeps what could not be sent and sends it all at once, in order, when it can', async () => {
    const s = setup('offline');
    await s.buffer.keep(point(30));
    await s.buffer.keep(point(15));
    expect(await s.buffer.flush()).toBe(false);
    expect(await s.buffer.count()).toBe(2);

    s.setBehaviour('ok');
    expect(await s.buffer.flush()).toBe(true);
    expect(s.sent).toEqual([[point(30), point(15)]]);
    expect(s.mem.has(CHECK_IN_BUFFER_KEY)).toBe(false);
  });

  it('drops what the server refuses rather than blocking every later check-in', async () => {
    const s = setup('refused');
    await s.buffer.keep(point(5));
    expect(await s.buffer.flush()).toBe(true);
    expect(await s.buffer.count()).toBe(0);
  });

  it('keeps a bounded number, dropping the oldest', async () => {
    const s = setup('offline');
    for (let i = MAX_KEPT + 20; i > 0; i--) await s.buffer.keep(point(i));
    expect(await s.buffer.count()).toBe(MAX_KEPT);
  });

  it('forgets check-ins older than a day', async () => {
    const s = setup('ok');
    s.mem.set(CHECK_IN_BUFFER_KEY, JSON.stringify([point(MAX_KEPT_AGE_MS / 60_000 + 5), point(10)]));
    await s.buffer.flush();
    expect(s.sent).toEqual([[point(10)]]);
  });

  it('survives corrupt storage', async () => {
    const s = setup('ok');
    s.mem.set(CHECK_IN_BUFFER_KEY, '{not json');
    expect(await s.buffer.flush()).toBe(true);
  });

  it('one flush at a time: two triggers send the batch once', async () => {
    const s = setup('ok');
    await s.buffer.keep(point(5));
    await Promise.all([s.buffer.flush(), s.buffer.flush()]);
    expect(s.sent).toHaveLength(1);
  });
});
