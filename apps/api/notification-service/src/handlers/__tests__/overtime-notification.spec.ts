import { OVERTIME_NOTICE_KINDS } from '@hbcfield/shared';
import { OvertimeNotificationHandler } from '../overtime-notification.handler';
import { renderText } from '../../i18n/translate';

/*
  The overtime pushes reached nobody: they were emitted on an event no handler
  listened to. This pins that the notice is handled, rendered (not English
  text from the sender) and recorded, and that every kind has its words.
*/
describe('OvertimeNotificationHandler', () => {
  const push = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
  const store = { record: jest.fn().mockResolvedValue(undefined) };
  const handler = new OvertimeNotificationHandler(push as any, store as any);

  beforeEach(() => jest.clearAllMocks());

  it('pushes each kind to its recipients, rendered from the catalogue, with the tap routing kept', async () => {
    for (const kind of OVERTIME_NOTICE_KINDS) {
      jest.clearAllMocks();
      await handler.handle({ recipientIds: ['u1', 'u1', 'u2'], organizationId: 'o1', kind, params: { name: 'Anna', location: 'Warehouse' }, data: { type: 'overtime.approval_request', overtimeRequestId: 'ot1' } });
      const [ids, text, data] = push.sendToUsers.mock.calls[0];
      expect(ids).toEqual(['u1', 'u2']);
      expect(data).toEqual({ type: 'overtime.approval_request', overtimeRequestId: 'ot1' });
      // A rendered message, never the bare key.
      for (const lang of ['en', 'de', 'es', 'fr', 'it'] as const) {
        const r = renderText(lang, text);
        expect(r.title).toBeTruthy();
        expect(r.title).not.toMatch(/overtime\./);
        expect(r.body).not.toMatch(/overtime\.|\{\{/);
      }
      expect(store.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: `overtime.${kind}` }));
    }
  });

  it('ignores an unknown kind and an empty recipient list', async () => {
    await handler.handle({ recipientIds: [], organizationId: 'o1', kind: 'expiredPrompt', params: {}, data: { type: 'x' } } as any);
    await handler.handle({ recipientIds: ['u1'], organizationId: 'o1', kind: 'nope', params: {}, data: { type: 'x' } } as any);
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });
});
