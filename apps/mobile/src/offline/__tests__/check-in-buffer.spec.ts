/**
 * Check-ins kept while the phone has no signal.
 */
import { CHECK_IN_BUFFER_KEY, checkInBufferKey, MAX_KEPT, MAX_KEPT_AGE_MS, createCheckInBuffer, type KeptCheckIn } from '../../services/check-in-buffer';

const NOW = Date.parse('2026-09-14T11:40:00.000Z');

const KEY = checkInBufferKey('u1');

function setup(behaviour: 'ok' | 'offline' | 'refused' = 'ok', owner: () => string | null = () => 'u1') {
  const mem = new Map<string, string>();
  const sent: KeptCheckIn[][] = [];
  const offlineError = Object.assign(new Error('Network request failed'), { statusCode: 0 });
  const buffer = createCheckInBuffer({
    storage: {
      getItem: async (k) => mem.get(k) ?? null,
      setItem: async (k, v) => void mem.set(k, v),
      removeItem: async (k) => void mem.delete(k),
      getAllKeys: async () => [...mem.keys()],
      multiRemove: async (ks) => ks.forEach((k) => mem.delete(k)),
    },
    owner: async () => owner(),
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
    expect(s.mem.has(KEY)).toBe(false);
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
    s.mem.set(KEY, JSON.stringify([point(MAX_KEPT_AGE_MS / 60_000 + 5), point(10)]));
    await s.buffer.flush();
    expect(s.sent).toEqual([[point(10)]]);
  });

  it('survives corrupt storage', async () => {
    const s = setup('ok');
    s.mem.set(KEY, '{not json');
    expect(await s.buffer.flush()).toBe(true);
  });

  it('one flush at a time: two triggers send the batch once', async () => {
    const s = setup('ok');
    await s.buffer.keep(point(5));
    await Promise.all([s.buffer.flush(), s.buffer.flush()]);
    expect(s.sent).toHaveLength(1);
  });
});

/**
 * ⚠️ A check-in is where somebody was. Member A's dead-zone check-ins used to be
 * sent with member B's token the moment B signed in on the same phone.
 */
describe('kept check-ins belong to one member', () => {
  it('another member signing in never sends the first one\'s check-ins', async () => {
    let who: string | null = 'mike';
    const s = setup('offline', () => who);
    await s.buffer.keep(point(20));
    expect(await s.buffer.flush()).toBe(false);

    who = 'karim';
    s.setBehaviour('ok');
    expect(await s.buffer.flush()).toBe(true);
    expect(s.sent).toEqual([]);
    expect(await s.buffer.count()).toBe(0);
    // Mike's stay his, under his own key.
    expect(s.mem.has(checkInBufferKey('mike'))).toBe(true);
  });

  it('with nobody signed in, nothing is kept and nothing is sent', async () => {
    const s = setup('ok', () => null);
    await s.buffer.keep(point(3));
    expect(s.mem.size).toBe(0);
    expect(await s.buffer.flush()).toBe(true);
    expect(s.sent).toEqual([]);
  });

  it('forgetAll removes every member\'s list and the old shared one', async () => {
    const s = setup('offline', () => 'mike');
    await s.buffer.keep(point(4));
    s.mem.set(checkInBufferKey('karim'), JSON.stringify([point(2)]));
    s.mem.set(CHECK_IN_BUFFER_KEY, JSON.stringify([point(1)]));
    s.mem.set('unrelated', 'x');
    await s.buffer.forgetAll();
    expect([...s.mem.keys()]).toEqual(['unrelated']);
  });
});
