import { WebsocketGateway } from '../websocket.gateway';
import { ChatMembersCache } from '../chat-members';

/**
 * The typing relay believed the client: it took the recipient list off the
 * wire, so a member could make "…is typing" appear for anyone they could name
 * in their organization. Recipients now come from the conversation's members
 * (database, cached a minute); the client's list is ignored. Typing still never
 * crosses an organization, and never reaches a portal customer.
 */
describe('WebsocketGateway.handleChatTyping', () => {
  let gateway: WebsocketGateway;
  let emitted: Array<{ room: string; event: string; payload: any }>;
  let members: Record<string, string[]>;
  let loads: number;

  const ORG = 'org-mine';
  const OTHER_ORG = 'org-theirs';

  const connect = (socketId: string, userId: string, organizationId: string, role = 'EMPLOYEE') => {
    (gateway as any).connectedClients.set(socketId, {
      userId, role, organizationId, connectedAt: new Date(), rooms: [],
    });
  };

  beforeEach(() => {
    gateway = Object.create(WebsocketGateway.prototype) as WebsocketGateway;
    (gateway as any).connectedClients = new Map();
    emitted = [];
    members = { c1: ['me', 'mate'] };
    loads = 0;
    (gateway as any).chatMembers = new ChatMembersCache(async (id) => {
      loads++;
      return members[id] ?? [];
    });
    (gateway as any).server = {
      to: (room: string) => ({ emit: (event: string, payload: any) => emitted.push({ room, event, payload }) }),
    };
    connect('s-me', 'me', ORG);
  });

  const type = (conversationId = 'c1', recipientIds: string[] = []) =>
    gateway.handleChatTyping({ id: 's-me' } as any, { conversationId, recipientIds, from: 'me' });

  it('reaches the other member of the conversation', async () => {
    connect('s-mate', 'mate', ORG);
    await type();
    expect(emitted.map((e) => e.room)).toEqual(['user:mate']);
  });

  it('ignores the recipients the client names — a colleague outside the conversation gets nothing', async () => {
    connect('s-mate', 'mate', ORG);
    connect('s-boss', 'boss', ORG);
    await type('c1', ['boss', 'mate']);
    expect(emitted.map((e) => e.room)).toEqual(['user:mate']);
  });

  it('reaches nobody when the sender is not in the conversation', async () => {
    members.c2 = ['mate', 'boss'];
    connect('s-mate', 'mate', ORG);
    await type('c2');
    expect(emitted).toEqual([]);
  });

  it('does not reach a member at another organization', async () => {
    members.c1 = ['me', 'guest'];
    connect('s-guest', 'guest', OTHER_ORG);
    await type();
    expect(emitted).toEqual([]);
  });

  it('skips members who are not connected', async () => {
    await type();
    expect(emitted).toEqual([]);
  });

  it('never echoes back to the sender', async () => {
    members.c1 = ['me'];
    await type();
    expect(emitted).toEqual([]);
  });

  it('does not relay for a portal customer, nor to one', async () => {
    connect('s-cust', 'cust', ORG, 'CUSTOMER');
    members.c1 = ['me', 'cust'];
    await type();
    await gateway.handleChatTyping({ id: 's-cust' } as any, { conversationId: 'c1' });
    expect(emitted).toEqual([]);
  });

  it('reports the sender from their own socket, not the payload', async () => {
    connect('s-mate', 'mate', ORG);
    await gateway.handleChatTyping({ id: 's-me' } as any, { conversationId: 'c1', from: 'someone-else' });
    expect(emitted[0]!.payload.from).toBe('me');
  });

  it('ignores a malformed payload and an unauthenticated socket', async () => {
    connect('s-mate', 'mate', ORG);
    await gateway.handleChatTyping({ id: 's-me' } as any, null as any);
    await gateway.handleChatTyping({ id: 's-me' } as any, { conversationId: 42 } as any);
    await gateway.handleChatTyping({ id: 's-unknown' } as any, { conversationId: 'c1' });
    expect(emitted).toEqual([]);
  });

  it('reads the members once per conversation while someone keeps typing', async () => {
    connect('s-mate', 'mate', ORG);
    await type();
    await type();
    await type();
    expect(loads).toBe(1);
  });
});

describe('ChatMembersCache', () => {
  it('reads again after the minute is up', async () => {
    let t = 0;
    let loads = 0;
    const cache = new ChatMembersCache(
      async () => {
        loads++;
        return ['a'];
      },
      60_000,
      10,
      () => t,
    );
    await cache.members('c');
    t = 59_000;
    await cache.members('c');
    t = 61_000;
    await cache.members('c');
    expect(loads).toBe(2);
  });

  it('keeps at most the configured number of conversations', async () => {
    const cache = new ChatMembersCache(async (id) => [id], 60_000, 2);
    await cache.members('a');
    await cache.members('b');
    await cache.members('c');
    expect((cache as any).rows.size).toBe(2);
    expect((cache as any).rows.has('a')).toBe(false);
  });
});
