import { Controller, Get, HttpException, HttpStatus, NotFoundException, Param, Res } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { CalendarGatewayService } from './calendar.service';

/**
 * The private ICS link a member pastes into Google, Outlook or the iPhone. Public by nature — the
 * token IS the credential (32 random bytes, stored only as a hash). Throttled hard: calendar apps
 * poll every few hours, a guesser polls every millisecond. Every failure is the same 404.
 */
/**
 * Per LINK, not per address: Google and Outlook fetch every subscriber's feed from a few shared
 * addresses, so a per-IP limit would refuse real subscriptions as more members switch it on. Each
 * link may be fetched 30 times a minute; the per-IP limit above only stops a flood.
 */
const PER_LINK_PER_MINUTE = 30;
const hits = new Map<string, { at: number; n: number }>();
function allowLink(token: string): boolean {
  const now = Date.now();
  const key = createHash('sha256').update(token).digest('hex').slice(0, 32);
  const h = hits.get(key);
  if (!h || now - h.at > 60_000) {
    if (hits.size > 50_000) hits.clear();
    hits.set(key, { at: now, n: 1 });
    return true;
  }
  h.n++;
  return h.n <= PER_LINK_PER_MINUTE;
}

@ApiExcludeController()
@Controller('calendar-feed')
export class CalendarFeedController {
  constructor(private readonly svc: CalendarGatewayService) {}

  @Get(':file')
  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async feed(@Param('file') file: string, @Res() res: Response) {
    const m = /^([A-Za-z0-9_-]{40,64})\.ics$/.exec(file ?? '');
    if (!m) throw new NotFoundException();
    if (!allowLink(m[1]!)) throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    let ics: string;
    try {
      const r: any = await this.svc.read('calendar_feed_render', { token: m[1] });
      ics = r?.data?.ics;
    } catch {
      throw new NotFoundException();
    }
    if (typeof ics !== 'string') throw new NotFoundException();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="hbcfield.ics"');
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(ics);
  }
}
