import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
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
@ApiExcludeController()
@Controller('calendar-feed')
export class CalendarFeedController {
  constructor(private readonly svc: CalendarGatewayService) {}

  @Get(':file')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async feed(@Param('file') file: string, @Res() res: Response) {
    const m = /^([A-Za-z0-9_-]{40,64})\.ics$/.exec(file ?? '');
    if (!m) throw new NotFoundException();
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
