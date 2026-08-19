import { WebsocketGateway } from '../websocket.gateway';

/**
 * The typing relay had two holes, and they are the same hole seen twice: it
 * believed the client.
 *
 * It took the recipient list straight off the wire, so a member could make
 * "…is typing" appear for anyone they could name. And it never looked at
 * organizations, so a cross-org conversation — opened because two companies
 * share a space to coordinate work — also broadcast keystroke-level activity
 * about one company's staff to the other.
 */
describe('WebsocketGateway.handleChatTyping', () => {
  let gateway: WebsocketGateway;
  let emitted: Array<{ room: string; event: string }>;

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
    (gateway as any).server = {
      to: (room: string) => ({ emit: (event: string) => emitted.push({ room, event }) }),
    };
    connect('s-me', 'me', ORG);
  });

  const type = (recipientIds: string[], from = 'me') =>
    gateway.handleChatTyping({ id: 's-me' } as any, { conversationId: 'c1', recipientIds, from });

  it('reaches a colleague in the same organization', () => {
    connect('s-mate', 'mate', ORG);
    type(['mate']);
    expect(emitted.map((e) => e.room)).toEqual(['user:mate']);
  });

  it('does not reach someone at another organization', () => {
    // The cross-org conversation is legitimate; watching them type is not.
    connect('s-guest', 'guest', OTHER_ORG);
    type(['guest']);
    expect(emitted).toEqual([]);
  });

  it('delivers only to the colleagues among a mixed list', () => {
    connect('s-mate', 'mate', ORG);
    connect('s-guest', 'guest', OTHER_ORG);
    type(['mate', 'guest']);
    expect(emitted.map((e) => e.room)).toEqual(['user:mate']);
  });

  it('ignores names the sender simply made up', () => {
    // Nobody by that id is connected, so there is nothing to verify against —
    // and an unverified recipient is not a recipient.
    type(['someone-i-invented']);
    expect(emitted).toEqual([]);
  });

  it('never echoes back to the sender', () => {
    type(['me']);
    expect(emitted).toEqual([]);
  });

  it('does not relay for a portal customer', () => {
    (gateway as any).connectedClients.set('s-cust', {
      userId: 'cust', role: 'CUSTOMER', organizationId: ORG, connectedAt: new Date(), rooms: [],
    });
    connect('s-mate', 'mate', ORG);
    gateway.handleChatTyping({ id: 's-cust' } as any, { conversationId: 'c1', recipientIds: ['mate'], from: 'cust' });
    expect(emitted).toEqual([]);
  });

  it('does not let a member type at a portal customer', () => {
    (gateway as any).connectedClients.set('s-cust', {
      userId: 'cust', role: 'CUSTOMER', organizationId: ORG, connectedAt: new Date(), rooms: [],
    });
    type(['cust']);
    expect(emitted).toEqual([]);
  });

  it('reports the sender from their own socket, not the payload', () => {
    connect('s-mate', 'mate', ORG);
    let captured: any;
    (gateway as any).server = {
      to: () => ({ emit: (_e: string, payload: any) => (captured = payload) }),
    };
    // A spoofed `from` must not travel.
    gateway.handleChatTyping({ id: 's-me' } as any, { conversationId: 'c1', recipientIds: ['mate'], from: 'someone-else' });
    expect(captured.from).toBe('me');
  });

  it('ignores a malformed payload', () => {
    gateway.handleChatTyping({ id: 's-me' } as any, { conversationId: 'c1' } as any);
    gateway.handleChatTyping({ id: 's-me' } as any, null as any);
    expect(emitted).toEqual([]);
  });

  it('ignores an unauthenticated socket', () => {
    connect('s-mate', 'mate', ORG);
    gateway.handleChatTyping({ id: 's-unknown' } as any, { conversationId: 'c1', recipientIds: ['mate'], from: 'x' });
    expect(emitted).toEqual([]);
  });
});
