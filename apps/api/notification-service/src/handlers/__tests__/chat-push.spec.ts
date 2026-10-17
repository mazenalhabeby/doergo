import { ChatNotificationHandler } from '../chat-notification.handler';
import { WebsocketGateway } from '../../modules/websocket/websocket.gateway';
import { ChatMembersCache } from '../../modules/websocket/chat-members';

/**
 * A chat push only where it adds something: never to somebody who muted the
 * thread, never to somebody reading it right now. The socket reaches everyone.
 */
describe('chat push', () => {
  function setup() {
    const gateway = Object.create(WebsocketGateway.prototype) as any;
    gateway.connectedClients = new Map();
    gateway.server = { to: () => ({ emit: jest.fn() }) };
    gateway.chatMembers = new ChatMembersCache(async () => ['anna', 'mike', 'karim']);
    const push = { sendToUsers: jest.fn(async () => undefined) };
    const handler = new ChatNotificationHandler(push as any, gateway);
    const connect = (sid: string, userId: string) =>
      gateway.connectedClients.set(sid, {
        userId,
        role: 'EMPLOYEE',
        organizationId: 'o',
        connectedAt: new Date(),
        rooms: [],
      });
    return { gateway, push, handler, connect };
  }
  const message = {
    id: 'm',
    senderId: 'anna',
    body: '',
    attachments: [{ fileName: 'valve.jpg' }],
    sender: { firstName: 'Anna', lastName: 'Müller' },
  };

  it('skips the muted and the one already reading the thread', async () => {
    const { gateway, push, handler, connect } = setup();
    connect('s-mike', 'mike');
    await gateway.handleChatView({ id: 's-mike' }, { conversationId: 'c1' });
    await handler.handleMessage({
      conversationId: 'c1',
      message,
      recipients: ['mike', 'karim', 'lisa'],
      organizationId: 'o',
      muted: ['karim'],
    });
    expect(push.sendToUsers).toHaveBeenCalledWith(['lisa'], expect.anything(), { type: 'chat', conversationId: 'c1' });
  });

  it('a file-only message pushes the file name', async () => {
    const { push, handler } = setup();
    await handler.handleMessage({ conversationId: 'c1', message, recipients: ['mike'], organizationId: 'o' });
    const text: any = (push.sendToUsers.mock.calls[0] as any[])[1];
    expect(JSON.stringify(text.body)).toContain('valve.jpg');
  });

  it('nobody left to tell → no push at all', async () => {
    const { push, handler } = setup();
    await handler.handleMessage({
      conversationId: 'c1',
      message,
      recipients: ['karim'],
      organizationId: 'o',
      muted: ['karim'],
    });
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  it('"looking at" a conversation one is not in records nothing', async () => {
    const { gateway, connect } = setup();
    connect('s-x', 'stranger');
    await gateway.handleChatView({ id: 's-x' }, { conversationId: 'c1' });
    expect(gateway.isViewingConversation('stranger', 'c1')).toBe(false);
    connect('s-m', 'mike');
    await gateway.handleChatView({ id: 's-m' }, { conversationId: 'c1' });
    expect(gateway.isViewingConversation('mike', 'c1')).toBe(true);
    await gateway.handleChatView({ id: 's-m' }, { conversationId: null });
    expect(gateway.isViewingConversation('mike', 'c1')).toBe(false);
  });
});
