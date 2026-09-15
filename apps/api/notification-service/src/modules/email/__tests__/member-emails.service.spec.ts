import { MEMBER_EMAILS, MEMBER_EMAIL_PREF, ORG_EMAIL_SWITCH, type MemberEmail } from '@hbcfield/shared';
import { EmailService } from '../email.service';
import { MemberEmailsService, MEMBER_EMAIL_WINDOW_MS } from '../member-emails.service';
import { RecipientLocales } from '../../../i18n/recipient-locales.service';
import { AttendanceNotificationHandler } from '../../../handlers/attendance-notification.handler';
import { TaskNotificationHandler } from '../../../handlers/task-notification.handler';

/**
 * The three member emails: who gets them, how often, and where they link.
 */

interface Row {
  id: string;
  email: string;
  firstName?: string;
  locale?: string | null;
  isActive?: boolean;
  isExternal?: boolean;
  role?: string;
  notificationPrefs?: Record<string, boolean> | null;
  organization?: { notificationPrefs?: Record<string, boolean> | null; suspendedAt?: Date | null } | null;
}

function member(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    email: `${id}@acme.at`,
    firstName: id.toUpperCase(),
    locale: null,
    isActive: true,
    isExternal: false,
    role: 'EMPLOYEE',
    notificationPrefs: null,
    organization: { notificationPrefs: null, suspendedAt: null },
    ...over,
  };
}

function setup(rows: Row[], appUrl: string | null = 'https://app.hbcfield.test.com/') {
  const audienceQueries: any[] = [];
  const prisma = {
    user: {
      findMany: jest.fn(async (args: any) => {
        const wanted = rows.filter((r) => args.where.id.in.includes(r.id));
        if (args.select.locale) return wanted.map((r) => ({ id: r.id, locale: r.locale ?? null }));
        audienceQueries.push(args);
        return wanted;
      }),
    },
  };
  const config = { get: (key: string, fallback?: unknown) => (key === 'APP_URL' ? appUrl : fallback) };
  const email = new EmailService(config as any, new RecipientLocales(prisma as any));
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  jest.spyOn(email, 'sendEmail').mockImplementation(async (to, subject, html) => {
    sent.push({ to, subject, html });
    return { success: true };
  });
  const service = new MemberEmailsService(prisma as any, email, config as any);
  return { service, email, prisma, sent, audienceQueries };
}

const task = (id: string, title = `Job ${id}`) => ({ id, title, priority: 'HIGH', description: null, locationAddress: null });

afterEach(() => {
  jest.useRealTimers();
});

describe('who a member email may go to', () => {
  /*
    The organization is the ceiling, the member opts out underneath it, and an
    unset key at either level means ON — every combination, for every email.
  */
  const levels: Array<[string, boolean | undefined]> = [['unset', undefined], ['on', true], ['off', false]];
  const cases = MEMBER_EMAILS.flatMap((kind) =>
    levels.flatMap(([orgLabel, org]) =>
      levels.map(([memberLabel, mine]) => [kind, orgLabel, org, memberLabel, mine] as const),
    ),
  );

  it.each(cases)('%s: organization %s × member %s', async (kind, _o, org, _m, mine) => {
    const row = member('u1', {
      organization: { notificationPrefs: org === undefined ? {} : { [ORG_EMAIL_SWITCH[kind]]: org }, suspendedAt: null },
      notificationPrefs: mine === undefined ? null : { [MEMBER_EMAIL_PREF[kind as MemberEmail]]: mine },
    });
    const { service } = setup([row]);
    const got = await service.recipients(kind, ['u1']);
    expect(got.length === 1).toBe(org !== false && mine !== false);
  });

  it('a member switching one email off keeps the others', async () => {
    const { service } = setup([member('u1', { notificationPrefs: { emailTaskAssigned: false, attendance: false } })]);
    expect(await service.recipients('taskAssigned', ['u1'])).toEqual([]);
    expect(await service.recipients('taskCompleted', ['u1'])).toHaveLength(1);
    // A push category opt-out is a different switch and does not silence email.
    expect(await service.recipients('autoClockOut', ['u1'])).toHaveLength(1);
  });

  it('never the actor, and asks nothing when the actor was the only one', async () => {
    const { service, prisma } = setup([member('boss'), member('u1')]);
    expect(await service.recipients('taskAssigned', ['boss'], { actorId: 'boss' })).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect((await service.recipients('taskAssigned', ['boss', 'u1'], { actorId: 'boss' })).map((r) => r.id)).toEqual(['u1']);
  });

  it('never an external member, a portal client, a deactivated account or a switched-off organization', async () => {
    const { service } = setup([
      member('staff'),
      member('ext', { isExternal: true }),
      member('client', { role: 'CUSTOMER' }),
      member('gone', { isActive: false }),
      member('suspended', { organization: { notificationPrefs: null, suspendedAt: new Date() } }),
      member('orphan', { organization: null }),
    ]);
    const got = await service.recipients('taskAssigned', ['staff', 'ext', 'client', 'gone', 'suspended', 'orphan']);
    expect(got.map((r) => r.id)).toEqual(['staff']);
  });

  it('never an address that can never be delivered', async () => {
    const { service } = setup([
      member('ok'),
      member('bad1', { email: 'no-at-sign' }),
      member('bad2', { email: 'someone@imported.invalid' }),
      member('bad3', { email: 'a b@x.com' }),
      member('bad4', { email: 'dev@box.localhost' }),
    ]);
    const got = await service.recipients('taskCompleted', ['ok', 'bad1', 'bad2', 'bad3', 'bad4']);
    expect(got.map((r) => r.id)).toEqual(['ok']);
  });

  it('resolves a whole list with ONE query, by id, and never takes an address from the caller', async () => {
    const { service, audienceQueries } = setup([member('a'), member('b'), member('c')]);
    await service.recipients('taskAssigned', ['a', 'b', 'c', 'a', null, undefined]);
    expect(audienceQueries).toHaveLength(1);
    expect(audienceQueries[0].where).toEqual({ id: { in: ['a', 'b', 'c'] } });
  });
});

describe('task emails', () => {
  it('sends "assigned" with a link to the task, and nothing when the member assigned themselves', async () => {
    const { service, sent } = setup([member('u1', { locale: 'de' })]);
    await service.taskAssigned({ task: task('t 1', 'Pumpe'), recipientId: 'u1', actorId: 'boss' });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('u1@acme.at');
    expect(sent[0].subject).toBe('Aufgabe zugewiesen: Pumpe');
    // Trailing slash on APP_URL, and an id that needs encoding.
    expect(sent[0].html).toContain('href="https://app.hbcfield.test.com/tasks/t%201"');

    await service.taskAssigned({ task: task('t2'), recipientId: 'u1', actorId: 'u1' });
    expect(sent).toHaveLength(1);
    service.onModuleDestroy();
  });

  it('sends "completed" to the creator, never to a creator who completed it', async () => {
    const { service, sent } = setup([member('creator')]);
    await service.taskCompleted({ task: task('t1'), recipientId: 'creator', actorId: 'creator' });
    expect(sent).toHaveLength(0);
    await service.taskCompleted({ task: task('t1'), recipientId: 'creator', actorId: 'tech' });
    expect(sent.map((s) => s.subject)).toEqual(['Task completed: Job t1']);
    service.onModuleDestroy();
  });

  it('folds a burst into one email now and ONE digest per member per window', async () => {
    jest.useFakeTimers();
    const { service, sent, audienceQueries } = setup([member('u1'), member('u2')]);

    for (let i = 1; i <= 20; i++) {
      await service.taskAssigned({ task: task(`t${i}`), recipientId: 'u1', actorId: 'boss' });
    }
    await service.taskAssigned({ task: task('x1'), recipientId: 'u2', actorId: 'boss' });

    // The first for each member went at once; the other nineteen are held.
    expect(sent.map((s) => s.to)).toEqual(['u1@acme.at', 'u2@acme.at']);

    jest.advanceTimersByTime(MEMBER_EMAIL_WINDOW_MS);
    await jest.runOnlyPendingTimersAsync().catch(() => undefined);
    for (let i = 0; i < 10; i++) await Promise.resolve();

    const digests = sent.slice(2);
    expect(digests).toHaveLength(1);
    expect(digests[0].to).toBe('u1@acme.at');
    expect(digests[0].subject).toBe('19 tasks were assigned to you');
    expect(digests[0].html).toContain('https://app.hbcfield.test.com/tasks/t20');
    expect(digests[0].html).toContain('href="https://app.hbcfield.test.com/tasks"');
    expect(digests[0].html).not.toContain('/tasks/t1"');
    // One audience query per email, not one per event.
    expect(audienceQueries).toHaveLength(3);
    service.onModuleDestroy();
  });

  it('a digest still respects a switch turned off during the window', async () => {
    jest.useFakeTimers();
    const rows = [member('u1')];
    const { service, sent } = setup(rows);
    await service.taskCompleted({ task: task('t1'), recipientId: 'u1', actorId: 'tech' });
    await service.taskCompleted({ task: task('t2'), recipientId: 'u1', actorId: 'tech' });
    rows[0].notificationPrefs = { emailTaskCompleted: false };
    jest.advanceTimersByTime(MEMBER_EMAIL_WINDOW_MS);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(sent).toHaveLength(1);
    service.onModuleDestroy();
  });
});

describe('the shift the sweep closed', () => {
  const event = {
    entryId: 'e1',
    userId: 'u1',
    clockInAt: '2026-09-14T06:00:00.000Z',
    clockOutAt: '2026-09-14T15:00:00.000Z',
    basis: 'SHIFT_END',
    timezone: 'Europe/Vienna',
    locationName: 'Lager Gmunden',
    organizationId: 'org-1',
  };

  function handler(rows: Row[]) {
    const s = setup(rows);
    const push = { sendAttendanceResolvedPush: jest.fn() };
    const ws = { emitToUser: jest.fn(), emitToOrganization: jest.fn() };
    const store = { record: jest.fn() };
    const h = new AttendanceNotificationHandler(s.email, s.service, push as any, ws as any, store as any);
    return { ...s, h, push };
  }

  it('emails the member alongside the push, with the temporary time and a link to confirm', async () => {
    const { h, push, sent } = handler([member('u1', { firstName: 'Mira', locale: 'en' })]);
    await h.handleShiftClosedProvisionally(event);

    expect(push.sendAttendanceResolvedPush).toHaveBeenCalledWith(expect.objectContaining({ recipientIds: ['u1'] }));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('u1@acme.at');
    expect(sent[0].subject).toBe('Your shift on Monday, September 14 was closed — confirm your time');
    expect(sent[0].html).toContain('Hello Mira,');
    expect(sent[0].html).toContain('Lager Gmunden');
    // 15:00 UTC is 17:00 in Vienna — the time the member lived.
    expect(sent[0].html).toContain('17:00');
    expect(sent[0].html).toContain('The temporary time is the planned end of your shift.');
    expect(sent[0].html).toContain('href="https://app.hbcfield.test.com/my/attendance?confirm=e1"');
  });

  it('respects the organization ceiling and the member opt-out', async () => {
    const off = handler([member('u1', { organization: { notificationPrefs: { emailOnAutoClockOut: false } } })]);
    await off.h.handleShiftClosedProvisionally(event);
    expect(off.sent).toHaveLength(0);
    expect(off.push.sendAttendanceResolvedPush).toHaveBeenCalled();

    const optedOut = handler([member('u1', { notificationPrefs: { emailAutoClockOut: false } })]);
    await optedOut.h.handleShiftClosedProvisionally(event);
    expect(optedOut.sent).toHaveLength(0);
  });

  it('defaults APP_URL to the product domain', async () => {
    const s = setup([member('u1')], null);
    expect(s.service.link('/tasks')).toBe('https://hbcfield.com/tasks');
  });
});

describe('the task handler hands the ids over, never an address', () => {
  function handler() {
    const memberEmails = { taskAssigned: jest.fn(), taskCompleted: jest.fn() };
    const push = { sendTaskAssignedPush: jest.fn(), sendStatusChangePush: jest.fn(), sendToUsers: jest.fn() };
    const ws = { emitTaskAssigned: jest.fn(), emitTaskStatusChanged: jest.fn(), emitToUser: jest.fn() };
    const store = { record: jest.fn() };
    const h = new TaskNotificationHandler(memberEmails as any, push as any, ws as any, store as any);
    return { h, memberEmails };
  }
  const t = { id: 't1', title: 'Pump', organizationId: 'org-1', createdById: 'creator', assignedToId: 'tech' };

  it('assigned: the worker and the actor', async () => {
    const { h, memberEmails } = handler();
    await h.handleTaskAssigned({ task: t, workerId: 'tech', actorId: 'boss', workerEmail: 'attacker@evil.com' });
    expect(memberEmails.taskAssigned).toHaveBeenCalledWith({ task: t, recipientId: 'tech', actorId: 'boss' });
  });

  it('completed: only on COMPLETED, to the creator', async () => {
    const { h, memberEmails } = handler();
    await h.handleTaskStatusChanged({ task: t, oldStatus: 'NEW', newStatus: 'IN_PROGRESS', actorId: 'tech' });
    expect(memberEmails.taskCompleted).not.toHaveBeenCalled();
    await h.handleTaskStatusChanged({ task: t, oldStatus: 'IN_PROGRESS', newStatus: 'COMPLETED', actorId: 'tech' });
    expect(memberEmails.taskCompleted).toHaveBeenCalledWith({ task: t, recipientId: 'creator', actorId: 'tech' });
  });
});
