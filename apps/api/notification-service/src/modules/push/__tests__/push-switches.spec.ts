import { memberWantsPush, pushCategory } from '@hbcfield/shared';
import { PushService } from '../push.service';
import { msg } from '../../../i18n/translate';

describe('which switch a push falls under', () => {
  it.each([
    ['task_assigned', 'tasks'], ['status_change', 'tasks'], ['comment_added', 'tasks'], ['task_departure_due', 'tasks'],
    ['shift_reminder', 'attendance'], ['break_due', 'attendance'], ['overtime_decision', 'attendance'], ['noshow_reminder', 'attendance'], ['geofence_alert', 'attendance'], ['attendance_left_early', 'attendance'],
    ['time_off_response', 'timeOff'], ['time_off_request', 'timeOff'],
    ['chat_message', null], ['document_awaiting_signature', null], ['join_request_submitted', null], [undefined, null],
  ])('%s → %s', (type, cat) => {
    expect(pushCategory(type as string | undefined)).toBe(cat);
  });

  it('only an explicit "off" stops one; a message always goes', () => {
    expect(memberWantsPush({ tasks: false }, 'task_assigned')).toBe(false);
    expect(memberWantsPush({ tasks: true }, 'task_assigned')).toBe(true);
    expect(memberWantsPush({}, 'task_assigned')).toBe(true);
    expect(memberWantsPush(null, 'shift_reminder')).toBe(true);
    expect(memberWantsPush({ tasks: false, attendance: false, timeOff: false }, 'chat_message')).toBe(true);
  });
});

describe('the push sender respects them', () => {
  function service(prefs: Record<string, unknown>) {
    const prisma = {
      user: { findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id, notificationPrefs: prefs[id] ?? null }))) },
      userPushToken: { findMany: jest.fn(async ({ where }: any) => where.userId.in.map((userId: string) => ({ userId, token: `ExponentPushToken[${userId}]` }))) },
    };
    const svc = Object.create(PushService.prototype) as any;
    svc.prisma = prisma;
    svc.locales = { localesFor: async () => new Map() };
    svc.logger = { warn: () => undefined, log: () => undefined, error: () => undefined };
    svc.deliver = jest.fn(async (tokens: string[]) => ({ sent: tokens.length, failed: 0 }));
    return { svc, prisma };
  }
  const text = { title: msg('task.assigned.title'), body: msg('task.assigned.body', { task: 'Boiler' }) };

  it('drops a member who switched the category off', async () => {
    const { svc } = service({ a: { tasks: false } });
    const res = await svc.sendToUsers(['a', 'b'], text, { type: 'task_assigned' });
    expect((svc as any).deliver).toHaveBeenCalledWith([{ token: 'ExponentPushToken[b]', userId: 'b' }], expect.anything(), expect.anything(), expect.anything());
    expect(res.sent).toBe(1);
  });

  it('asks nothing for a push that falls under no switch', async () => {
    const { svc, prisma } = service({ a: { tasks: false, attendance: false, timeOff: false } });
    await svc.sendToUsers(['a'], text, { type: 'chat_message' });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect((svc as any).deliver).toHaveBeenCalled();
  });

  it('everyone off → nothing sent, and says why', async () => {
    const { svc } = service({ a: { timeOff: false } });
    expect(await svc.sendToUsers(['a'], text, { type: 'time_off_response' })).toMatchObject({ sent: 0, reason: 'switched_off' });
  });
});
