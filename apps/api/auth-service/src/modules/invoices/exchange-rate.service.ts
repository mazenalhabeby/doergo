import { Injectable, Logger } from '@nestjs/common';
import { crossRate, isSupportedCurrency } from '@hbcfield/shared';

/**
 * The European Central Bank's daily euro reference rates — what an invoice in
 * another currency fills its exchange rate from.
 *
 * ⚠️ BEST EFFORT, NEVER A GUESS. No answer (the feed is down, a currency it does
 * not quote that day) is null, and the screen then shows no margin and offers to
 * type a rate. A stale or invented number would put a wrong margin on an invoice
 * with nothing to say so.
 *
 * ⚠️ THE ECB'S STATIC FILES, NOT ITS DATA API. The data API answered one query
 * for every supported currency in ~28 seconds (and one for two currencies timed
 * out at 30) — a screen waiting on it would look broken. The published files are
 * the same reference rates: the last 90 days (70 KB, under a second) covers
 * nearly every invoice; the full history (8 MB, a few seconds) is fetched only
 * for an invoice dated further back, and kept for a day.
 *
 * ECB publishes on working days around 16:00 CET; a weekend or holiday reads the
 * last working day before it, which is what a bank does.
 */
const RECENT_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
const HISTORY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml';
/** The 90-day file covers this many days back with room for a holiday run at its far end. */
const RECENT_COVERS_DAYS = 80;
const RECENT_TTL_MS = 60 * 60 * 1000;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const RECENT_TIMEOUT_MS = 6000;
const HISTORY_TIMEOUT_MS = 20000;

type DayRates = Map<string, Record<string, number>>; // ECB day → { USD: 1.1225, … } (1 EUR = x)

export interface ExchangeRateAnswer {
  rate: number;
  /** The ECB day the rate is from — may be before the asked day (weekend, holiday). */
  date: string;
  source: 'ECB';
}

interface Cached {
  at: number;
  days: DayRates | null;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly files = new Map<string, Cached>();
  /** One download at a time per file — ten screens opening together share it. */
  private readonly inflight = new Map<string, Promise<DayRates | null>>();

  /** `1 {from} = rate {to}` on `day` (YYYY-MM-DD), or null. */
  async rate(from: string, to: string, day: string): Promise<ExchangeRateAnswer | null> {
    if (!isSupportedCurrency(from) || !isSupportedCurrency(to) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const today = new Date().toISOString().slice(0, 10);
    const asked = day > today ? today : day;
    if (from === to) return { rate: 1, date: asked, source: 'ECB' };

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_COVERS_DAYS);
    const recent = asked >= cutoff.toISOString().slice(0, 10);
    const days = recent
      ? await this.file(RECENT_URL, RECENT_TTL_MS, RECENT_TIMEOUT_MS)
      : await this.file(HISTORY_URL, HISTORY_TTL_MS, HISTORY_TIMEOUT_MS);
    if (!days) return null;
    return latestOnOrBefore(days, asked, from, to);
  }

  private async file(url: string, ttl: number, timeout: number): Promise<DayRates | null> {
    const hit = this.files.get(url);
    if (hit && Date.now() - hit.at < (hit.days ? ttl : FAILURE_TTL_MS)) return hit.days;
    const running = this.inflight.get(url);
    if (running) return running;
    const job = this.download(url, timeout).then((days) => {
      this.files.set(url, { at: Date.now(), days });
      this.inflight.delete(url);
      return days;
    });
    this.inflight.set(url, job);
    return job;
  }

  private async download(url: string, timeout: number): Promise<DayRates | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        this.logger.warn(`ECB rates: HTTP ${res.status} from ${url}`);
        return null;
      }
      const days = parseEcbXml(await res.text());
      if (days.size === 0) {
        this.logger.warn(`ECB rates: no rates in ${url}`);
        return null;
      }
      return days;
    } catch (e) {
      this.logger.warn(`ECB rates unavailable (${url}): ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The latest ECB day on or before `day` that quotes BOTH sides. */
export function latestOnOrBefore(days: DayRates, day: string, from: string, to: string): ExchangeRateAnswer | null {
  const keys = Array.from(days.keys()).filter((k) => k <= day).sort().reverse();
  for (const k of keys.slice(0, 15)) {
    const r = crossRate(days.get(k)!, from, to);
    if (r != null) return { rate: r, date: k, source: 'ECB' };
  }
  return null;
}

/** The ECB's eurofxref XML (`<Cube time="…"><Cube currency="USD" rate="1.12"/>…`) → rates per day. */
export function parseEcbXml(xml: string): DayRates {
  const days: DayRates = new Map();
  const dayRe = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  const rateRe = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/g;
  let d: RegExpExecArray | null;
  while ((d = dayRe.exec(xml))) {
    const rates: Record<string, number> = {};
    let r: RegExpExecArray | null;
    rateRe.lastIndex = 0;
    while ((r = rateRe.exec(d[2]))) {
      const v = Number(r[2]);
      if (Number.isFinite(v) && v > 0) rates[r[1]] = v;
    }
    if (Object.keys(rates).length) days.set(d[1], rates);
  }
  return days;
}
