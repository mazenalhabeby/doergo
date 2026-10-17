/** Emails about a shift that was closed for somebody. */
import { bold, emailTranslator, type EmailTranslator } from '../email-render';
import { zoneOf } from '../../utils/workspace-zone';
import { button, done, field, prefsFooter, type Locale, type RenderedEmail } from './base';

/**
 * A moment in the zone the shift was lived in, in the reader's language. An
 * unknown zone reads UTC rather than throwing out of a delivery path.
 */
function shiftMoment(
  t: EmailTranslator,
  value: string | Date,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return t.date(value, { ...options, timeZone: zoneOf(timezone) });
  } catch {
    return t.date(value, { ...options, timeZone: 'UTC' });
  }
}

const CLOSE_BASES = ['LEFT_SITE', 'LAST_SEEN', 'SHIFT_END', 'CLOCK_IN_PLUS_8H'] as const;

/**
 * A shift left open, closed by the sweep with a TEMPORARY clock-out.
 *
 * It says the time, why that time, and asks for the real one — the member is
 * the only person who knows it, and the entry waits in review until they say.
 * It replaced an "automatic clock-out" email that described a rule the product
 * no longer has (a hard 16-hour limit, an end-of-day cut-off) and that nothing
 * ever sent: the product does not end anybody's shift for them, it closes a
 * record that was left open.
 */
export function shiftClosedEmail(
  locale: Locale,
  data: {
    userName: string;
    locationName?: string | null;
    clockInAt: string | Date;
    clockOutAt: string | Date;
    timezone?: string | null;
    basis?: string | null;
    confirmUrl: string;
  },
): RenderedEmail {
  const t = emailTranslator(locale);
  const day = shiftMoment(t, data.clockInAt, data.timezone, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = (v: string | Date) => shiftMoment(t, v, data.timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const basis = CLOSE_BASES.find((b) => b === data.basis);
  const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">${t.html('autoClockOut.heading')}</h2>
        <p>${t.html('layout.greeting', { name: data.userName })}</p>
        <p>${t.html('autoClockOut.intro', { day: bold(day) })}</p>
        ${basis ? `<p>${t.html(`autoClockOut.basis.${basis}` as const)}</p>` : ''}

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #334155;">${t.html('autoClockOut.details')}</h3>
          ${data.locationName ? field(t, 'label.location', data.locationName) : ''}
          ${field(t, 'label.clockIn', time(data.clockInAt))}
          ${field(t, 'label.temporaryClockOut', time(data.clockOutAt))}
        </div>

        <p>${t.html('autoClockOut.ask')}</p>
        ${button(t, 'autoClockOut.button', data.confirmUrl)}
        <p style="color: #64748b; font-size: 14px;">${t.html('autoClockOut.appHint')}</p>
        ${prefsFooter(t)}
      </div>
    `;
  return done(t, t.text('autoClockOut.subject', { day }), body);
}
