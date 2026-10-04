import { ExchangeRateService, parseEcbXml, latestOnOrBefore } from '../exchange-rate.service';

/** The ECB's reference rates: read, crossed, cached — and never guessed. */
describe('ExchangeRateService', () => {
  const XML = `<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope><Cube>
    <Cube time="2026-10-02"><Cube currency="USD" rate="1.1355"/><Cube currency="JPY" rate="176.99"/></Cube>
    <Cube time="2026-10-01"><Cube currency="USD" rate="1.1300"/><Cube currency="CHF" rate="0.9300"/></Cube>
  </Cube></gesmes:Envelope>`;
  const realFetch = global.fetch;
  let calls = 0;
  afterEach(() => { global.fetch = realFetch; calls = 0; });
  const serve = (body: string, ok = true) => {
    global.fetch = jest.fn(async () => { calls++; return { ok, status: ok ? 200 : 503, text: async () => body } as any; }) as any;
  };
  const today = new Date().toISOString().slice(0, 10);

  it('reads the XML into rates per day', () => {
    const days = parseEcbXml(XML);
    expect(days.get('2026-10-02')).toEqual({ USD: 1.1355, JPY: 176.99 });
    expect(days.get('2026-10-01')).toEqual({ USD: 1.13, CHF: 0.93 });
  });

  it('a weekend reads the last working day; both sides must be quoted that day', () => {
    const days = parseEcbXml(XML);
    expect(latestOnOrBefore(days, '2026-10-04', 'USD', 'EUR')).toEqual({ rate: 0.880669, date: '2026-10-02', source: 'ECB' });
    // CHF has no rate on the 2nd, so the cross falls back to the 1st, when both were quoted.
    expect(latestOnOrBefore(days, '2026-10-04', 'USD', 'CHF')).toEqual({ rate: 0.823009, date: '2026-10-01', source: 'ECB' });
    expect(latestOnOrBefore(days, '2026-09-30', 'USD', 'EUR')).toBeNull();
  });

  it('asks the recent file for a recent day, once, and caches it', async () => {
    serve(XML.replace(/2026-10-02/g, today));
    const s = new ExchangeRateService();
    const [a, b] = await Promise.all([s.rate('USD', 'EUR', today), s.rate('USD', 'EUR', today)]);
    expect(a).toEqual({ rate: 0.880669, date: today, source: 'ECB' });
    expect(b).toEqual(a);
    await s.rate('JPY', 'USD', today);
    expect(calls).toBe(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('hist-90d');
  });

  it('an older day reads the full history', async () => {
    serve(XML);
    const s = new ExchangeRateService();
    expect(await s.rate('USD', 'EUR', '2020-01-10')).toBeNull(); // not in this tiny file: null, not a guess
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toMatch(/eurofxref-hist\.xml$/);
  });

  it('the feed down is null, not a number — and asked once, not once per keystroke', async () => {
    serve('', false);
    const s = new ExchangeRateService();
    expect(await s.rate('USD', 'EUR', today)).toBeNull();
    expect(await s.rate('USD', 'EUR', today)).toBeNull();
    expect(calls).toBe(1);
  });

  it('an unsupported currency or a bad day is refused without a request', async () => {
    serve(XML);
    const s = new ExchangeRateService();
    expect(await s.rate('XXX', 'EUR', '2026-10-02')).toBeNull();
    expect(await s.rate('USD', 'EUR', 'yesterday')).toBeNull();
    expect(await s.rate('EUR', 'EUR', '2026-10-02')).toEqual({ rate: 1, date: '2026-10-02', source: 'ECB' });
    expect(calls).toBe(0);
  });
});
