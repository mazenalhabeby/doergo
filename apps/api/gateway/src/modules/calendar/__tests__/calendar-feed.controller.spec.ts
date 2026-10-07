import { HttpException, HttpStatus, NotFoundException, RequestTimeoutException } from '@nestjs/common';
import { CalendarFeedController } from '../calendar-feed.controller';

/*
  The calendar link's answers. A refused link is 404 (a guesser learns nothing); a failure on OUR side
  must be 503, never 404 — Outlook treats a 404 as "this calendar is gone" and can drop the
  subscription, so a restart answering 404 would quietly cut every Outlook user off.
*/

const TOKEN = 'a'.repeat(43);
function res() {
  const headers: Record<string, string> = {};
  return { headers, body: '', setHeader: (k: string, v: string) => { headers[k] = v; }, send(b: string) { this.body = b; } };
}
const ctl = (read: () => Promise<unknown>) => new CalendarFeedController({ read } as any);

describe('calendar feed answers', () => {
  it('serves the calendar privately, never to be indexed', async () => {
    const r = res();
    await ctl(async () => ({ data: { ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' } })).feed(`${TOKEN}.ics`, r as any);
    expect(r.body).toContain('BEGIN:VCALENDAR');
    expect(r.headers['Content-Type']).toContain('text/calendar');
    expect(r.headers['Cache-Control']).toContain('private');
    expect(r.headers['X-Robots-Tag']).toBe('noindex');
  });

  it('a malformed link and a refused link are the same 404', async () => {
    await expect(ctl(async () => ({})).feed('nope.ics', res() as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctl(async () => { throw new NotFoundException(); }).feed(`${'b'.repeat(43)}.ics`, res() as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a failure on our side is 503 with Retry-After, not 404', async () => {
    for (const err of [new Error('ECONNREFUSED'), new RequestTimeoutException(), new HttpException('boom', 500)]) {
      const r = res();
      const p = ctl(async () => { throw err; }).feed(`${'c'.repeat(43)}${Math.random().toString(36).slice(2, 8)}.ics`, r as any);
      await expect(p).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
      expect(r.headers['Retry-After']).toBe('300');
    }
  });
});
