import { joined, msg, plural, render, renderText, verbatim } from '../translate';
import { RecipientLocales, LOCALE_CACHE_TTL_MS } from '../recipient-locales.service';
import { PushService, pendingApprovalText, restName, taskStatus } from '../../modules/push/push.service';
import { NotificationStore } from '../../common/notification-store.service';

/**
 * Writing a sentence for somebody whose language is only known at delivery.
 */
describe('render', () => {
  it('fills a sentence with its facts', () => {
    expect(render('en', msg('join.submitted.body', { name: 'Mira', org: 'HBC' }))).toBe('Mira asked to join HBC');
    expect(render('de', msg('join.submitted.body', { name: 'Mira', org: 'HBC' }))).toBe('Mira möchte HBC beitreten');
  });

  it('writes a nested phrase in the same language as the sentence around it', () => {
    const body = msg('timeOff.requested.body', { name: 'Ana', kind: msg('timeOff.kind.SICK'), range: '2026-09-20' });
    expect(render('en', body)).toBe('Ana asked for sick leave: 2026-09-20');
    expect(render('es', body)).toBe('Ana ha pedido baja por enfermedad: 2026-09-20');
  });

  it('chooses the plural form by the language’s own rule', () => {
    expect(render('en', plural('task.blocked.title', 1))).toBe('1 blocked task needs attention');
    expect(render('en', plural('task.blocked.title', 3))).toBe('3 blocked tasks need attention');
    // French counts zero as singular; English does not.
    expect(render('en', plural('assetLog.days', 0))).toBe('0 days');
    expect(render('fr', plural('assetLog.days', 0))).toBe('0 jour');
  });

  it('formats numbers the way the reader writes them', () => {
    const body = msg('attendance.autoClockOut.bodyEndOfDay', { location: 'Lager', hours: 8.5 });
    expect(render('en', body)).toContain('(8.5 h)');
    expect(render('de', body)).toContain('(8,5 Std.)');
  });

  it('passes a person’s own words through untouched, and trims them for a lock screen', () => {
    expect(render('fr', verbatim('Bitte morgen früh'))).toBe('Bitte morgen früh');
    expect(render('de', verbatim('x'.repeat(200), 120))).toHaveLength(120);
  });

  it('renders an empty fact as nothing rather than "undefined"', () => {
    expect(render('en', msg('issue.event.resolved', { name: 'Ali', reason: undefined }))).toBe('Ali marked it resolved');
  });

  it('joins phrases in the reader’s language', () => {
    const line = joined([plural('assetLog.days', 1), plural('assetLog.days', 2)], ' · ');
    expect(line('it')).toBe('1 giorno · 2 giorni');
  });

  it('renders a title and a body together', () => {
    expect(renderText('it', { title: msg('chat.newMessage'), body: verbatim('ciao') })).toEqual({
      title: 'Nuovo messaggio',
      body: 'ciao',
    });
  });
});

describe('phrases with rules of their own', () => {
  it('translates a built-in status and leaves an organization’s own status as named', () => {
    expect(render('de', msg('task.watch.status.body', { task: 'Pumpe', status: taskStatus('IN_PROGRESS') }))).toBe(
      '„Pumpe“ → In Bearbeitung',
    );
    expect(render('de', msg('task.watch.status.body', { task: 'Pumpe', status: taskStatus('WAITING_FOR_PARTS') }))).toBe(
      '„Pumpe“ → WAITING FOR PARTS',
    );
  });

  it('keeps a German noun capitalised and lower-cases it elsewhere', () => {
    expect(render('de', msg('attendance.breakDue.title', { rest: restName('Mittagspause') }))).toBe(
      'Zeit für Ihre Pause: Mittagspause',
    );
    expect(render('en', msg('attendance.breakDue.title', { rest: restName('Lunch break') }))).toBe('Time for your lunch break');
  });

  it('lists approval flags in the reader’s language, and still names one it does not know', () => {
    const text = pendingApprovalText('Sam', ['LATE_ARRIVAL', 'OUTSIDE_GEOFENCE_IN', 'OUTSIDE_GEOFENCE_OUT', 'NEW_FLAG']);
    expect(renderText('en', text).body).toBe('Sam’s time entry needs review (late arrival, out of geofence, new flag)');
    expect(renderText('fr', text).body).toBe('Le pointage de Sam doit être vérifié (arrivée tardive, hors zone, new flag)');
    expect(renderText('en', pendingApprovalText('Sam', [])).body).toBe('Sam’s time entry needs review (needs review)');
  });
});

describe('RecipientLocales', () => {
  const prisma = { user: { findMany: jest.fn(), updateMany: jest.fn() } };
  let locales: RecipientLocales;

  beforeEach(() => {
    jest.clearAllMocks();
    locales = new RecipientLocales(prisma as any);
  });

  it('answers a whole list with one query, and English for anybody never told', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'a', locale: 'de' },
      { id: 'b', locale: null },
      { id: 'c', locale: 'klingon' },
    ]);
    const result = await locales.localesFor(['a', 'b', 'c', 'a', null]);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(result)).toEqual({ a: 'de', b: 'en', c: 'en' });
  });

  it('asks the database only for what it does not already know', async () => {
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'a', locale: 'fr' }]);
    await locales.localesFor(['a']);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'b', locale: 'it' }]);
    const result = await locales.localesFor(['a', 'b']);
    expect(prisma.user.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: { in: ['b'] } } }));
    expect(Object.fromEntries(result)).toEqual({ a: 'fr', b: 'it' });
  });

  it('forgets after the cache window, so another replica’s write is picked up', async () => {
    jest.useFakeTimers();
    try {
      prisma.user.findMany.mockResolvedValue([{ id: 'a', locale: 'es' }]);
      await locales.localesFor(['a']);
      jest.advanceTimersByTime(LOCALE_CACHE_TTL_MS + 1);
      await locales.localesFor(['a']);
      expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to English when the database cannot be reached, and does not remember that', async () => {
    prisma.user.findMany.mockRejectedValueOnce(new Error('down'));
    expect((await locales.localesFor(['a'])).get('a')).toBe('en');
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'a', locale: 'de' }]);
    expect((await locales.localesFor(['a'])).get('a')).toBe('de');
  });

  it('stores a language it has a catalogue for, reduced from a device’s region form', async () => {
    expect(await locales.set('a', 'de-AT')).toBe('de');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'a' }, data: { locale: 'de' } });
  });

  it('refuses anything else without touching what was stored', async () => {
    expect(await locales.set('a', 'xx')).toBeNull();
    expect(await locales.set('a', '')).toBeNull();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('PushService — one text, many languages', () => {
  const prisma = { userPushToken: { findMany: jest.fn() } };
  const localeOf: Record<string, string> = {};
  const locales = { localesFor: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, localeOf[id] ?? 'en']))) };
  let service: PushService;
  let expoSends: any[][];

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PushService({} as any, prisma as any, locales as any);
    expoSends = [];
    (service as any).expo = {
      chunkPushNotifications: (messages: any[]) => [messages],
      sendPushNotificationsAsync: jest.fn(async (chunk: any[]) => {
        expoSends.push(chunk);
        return chunk.map(() => ({ status: 'ok' }));
      }),
    };
  });

  const token = (n: number) => `ExponentPushToken[t${n}]`;

  it('sends thirty people at most one batch per language, from one token query and one locale query', async () => {
    const langs = ['en', 'de', 'es', 'fr', 'it'];
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    ids.forEach((id, i) => (localeOf[id] = langs[i % 5]));
    prisma.userPushToken.findMany.mockResolvedValue(ids.map((userId, i) => ({ userId, token: token(i) })));

    await service.sendToUsers(ids, { title: msg('attendance.noShowEscalation.title'), body: msg('attendance.noShowEscalation.body', { name: 'Ali' }) }, { type: 'noshow_escalation' });

    expect(prisma.userPushToken.findMany).toHaveBeenCalledTimes(1);
    expect(locales.localesFor).toHaveBeenCalledTimes(1);
    expect(expoSends).toHaveLength(5);
    const titles = expoSends.map((chunk) => chunk[0].title).sort();
    expect(titles).toEqual(['Assenza', 'Ausencia', 'Absence', 'Nicht erschienen', 'No-show'].sort());
    // Everybody in a batch reads the language of that batch.
    for (const chunk of expoSends) {
      const lang = localeOf[ids[Number(/t(\d+)/.exec(chunk[0].to)![1])]];
      for (const m of chunk) expect(localeOf[ids[Number(/t(\d+)/.exec(m.to)![1])]]).toBe(lang);
    }
  });

  it('does not ask for languages when nobody has a phone registered', async () => {
    prisma.userPushToken.findMany.mockResolvedValue([]);
    await service.sendToUsers(['x'], { title: msg('chat.newMessage'), body: verbatim('hi') });
    expect(locales.localesFor).not.toHaveBeenCalled();
    expect(expoSends).toHaveLength(0);
  });
});

describe('NotificationStore — the bell in the reader’s language', () => {
  it('writes each recipient’s row in their own language', async () => {
    const prisma = { notificationDelivery: { createMany: jest.fn() } };
    const locales = { localesFor: jest.fn(async () => new Map([['a', 'de'], ['b', 'en']])) };
    const store = new NotificationStore(prisma as any, locales as any);

    await store.record({
      recipientIds: ['a', 'b'],
      organizationId: 'org',
      eventType: 'time_off_decided',
      text: { title: msg('timeOff.decided.titleApproved'), body: msg('timeOff.decided.bodyApproved', { range: '1–3 Okt' }) },
    });

    const rows = prisma.notificationDelivery.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.recipientId, r.payload.title])).toEqual([
      ['a', 'Abwesenheit genehmigt'],
      ['b', 'Time off approved'],
    ]);
  });
});
