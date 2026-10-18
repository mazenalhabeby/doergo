/** "Thursday approved · 9 h 20 min counted" — one push to the person, in their language. */
import { DayDecidedHandler, weekdayOf } from '../day-decided.handler';
import { renderText } from '../../i18n/translate';
import type { PushService } from '../../modules/push/push.service';

describe('day decided push', () => {
  const sent = () => {
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    return { push, handler: new DayDecidedHandler(push as unknown as PushService) };
  };

  it('approved: weekday and counted time, in the reader’s language', async () => {
    const { push, handler } = sent();
    await handler.handle({
      userId: 'u',
      organizationId: 'o',
      localDate: '2026-10-16',
      approved: true,
      countedMinutes: 560,
    });
    const [userId, text, data] = push.sendToUser.mock.calls[0]!;
    expect(userId).toBe('u');
    expect(data).toEqual({ type: 'attendance_day_decided', localDate: '2026-10-16', approved: true });
    expect(renderText('en', text)).toEqual({ title: 'Friday approved', body: 'Friday approved · 9 h 20 min counted' });
    expect(renderText('de', text).body).toBe('Freitag bestätigt · 9 Std. 20 Min. angerechnet');
  });

  it('not approved: says so and invites a look', async () => {
    const { push, handler } = sent();
    await handler.handle({
      userId: 'u',
      organizationId: 'o',
      localDate: '2026-10-16',
      approved: false,
      countedMinutes: 0,
    });
    expect(renderText('es', push.sendToUser.mock.calls[0]![1]).title).toBe('Viernes no aprobado');
  });

  it('the weekday opens the sentence with a capital, whatever the language', () => {
    expect(weekdayOf('2026-10-15')('fr')).toBe('Jeudi');
    expect(weekdayOf('2026-10-15')('it')).toBe('Giovedì');
  });
});
