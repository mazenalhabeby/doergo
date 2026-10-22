import { TimeOffNotificationHandler } from '../time-off-notification.handler';
import { renderText } from '../../../../i18n/translate';

/*
  A request that is not leave (requests/request-kinds.ts) rides the same two events, and the
  words name what was asked — a remote day at a workspace, changed hours, agreed overtime — in
  every language. Leave keeps its own sentences.
*/
describe('TimeOffNotificationHandler — every kind of request', () => {
  const push = { sendTimeOffRequestPush: jest.fn().mockResolvedValue(undefined), sendTimeOffApprovedPush: jest.fn().mockResolvedValue(undefined) };
  const socket = { emitToUser: jest.fn() };
  const store = { record: jest.fn().mockResolvedValue(undefined) };
  const handler = new TimeOffNotificationHandler(push as any, socket as any, store as any);
  const base = { timeOffId: 'r1', organizationId: 'o1', memberId: 'mike', memberName: 'Mike Weber', startDate: '2026-11-14', endDate: '2026-11-14', recipientIds: ['anna'] };

  beforeEach(() => jest.clearAllMocks());

  const asked = async (facts: Record<string, unknown>) => {
    await handler.handleRequested({ ...base, ...facts } as any);
    return push.sendTimeOffRequestPush.mock.calls[0][0].text;
  };

  it.each([
    [{ kind: 'REMOTE', spaceName: 'Main Office' }, 'Mike Weber asks for remote work instead of Main Office on 2026-11-14'],
    [{ kind: 'HOURS', startTime: '10:00', endTime: '15:00' }, 'Mike Weber asks for changed hours on 2026-11-14: 10:00–15:00'],
    [{ kind: 'HOURS', endTime: '18:00' }, 'Mike Weber asks for changed hours on 2026-11-14: finish at 18:00'],
    [{ kind: 'OVERTIME', minutes: 120 }, 'Mike Weber asks for 2 h 0 min of overtime on 2026-11-14'],
    [{ kind: 'OTHER', reason: 'Dentist at 9' }, 'Mike Weber asks: “Dentist at 9” (2026-11-14)'],
    [{ type: 'SICK' }, 'Mike Weber asked for sick leave: 2026-11-14'],
  ])('names %j', async (facts, english) => {
    const text = await asked(facts);
    expect(renderText('en', text).body).toBe(english);
    for (const lang of ['de', 'es', 'fr', 'it'] as const) {
      const r = renderText(lang, text);
      expect(r.title).toBeTruthy();
      expect(r.body).not.toMatch(/request\.|timeOff\.|\{\{/);
    }
  });

  it('the decision names what was decided, and keeps the refusal reason', async () => {
    await handler.handleDecided({ ...base, kind: 'OVERTIME', minutes: 90, approved: false, rejectionReason: 'Not this week' } as any);
    const text = push.sendTimeOffApprovedPush.mock.calls[0][0].text;
    expect(renderText('en', text)).toEqual({ title: 'Request not approved', body: 'Not approved: 1 h 30 min of overtime on 2026-11-14 — Not this week' });
    expect(renderText('de', text).body).toBe('Nicht genehmigt: 1 Std. 30 Min. Überstunden am 2026-11-14 — Not this week');
    expect(socket.emitToUser).toHaveBeenCalledWith('mike', 'time_off_decided', expect.objectContaining({ kind: 'OVERTIME' }));
  });

  it('leave keeps its own words', async () => {
    await handler.handleDecided({ ...base, approved: true } as any);
    expect(renderText('en', push.sendTimeOffApprovedPush.mock.calls[0][0].text).title).toBe('Time off approved');
  });
});
