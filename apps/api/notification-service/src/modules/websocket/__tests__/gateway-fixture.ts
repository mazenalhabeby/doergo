import { WebsocketGateway } from '../websocket.gateway';
import { ChatEvents } from '../chat-events';
import { MemberEvents } from '../member-events';
import { PresenceService } from '../presence.service';
import { SocketAuthenticator } from '../socket-authenticator';
import { SocketRegistry } from '../socket-registry';
import { SocketTokens } from '../socket-tokens';
import { SupportEvents } from '../support-events';
import { TaskEvents } from '../task-events';
import { TaskRooms } from '../task-rooms';
import type { MembersLoader } from '../chat-members';
import { ChatMembersCache } from '../chat-members';

/**
 * The gateway wired exactly as the module wires it, over a fake database and a fake
 * Socket.IO server that records every room emit.
 */
export function buildGateway(
  opts: { prisma?: Record<string, any>; config?: Record<string, string>; members?: MembersLoader } = {},
) {
  const prisma = (opts.prisma ?? {}) as any;
  const config = { JWT_ACCESS_SECRET: 'test-secret', ...(opts.config ?? {}) };
  const emitted: Array<{ room: string; event: string; data: any }> = [];
  const sockets = new Map<string, any>();
  const server: any = {
    to: (room: string) => ({ emit: (event: string, data: any) => emitted.push({ room, event, data }) }),
    emit: jest.fn(),
    sockets: { sockets },
  };

  const registry = new SocketRegistry();
  registry.attach(server);
  const tokens = new SocketTokens({ get: (k: string) => (config as Record<string, string>)[k] } as any);
  const presence = new PresenceService(registry, prisma);
  const support = new SupportEvents(registry, prisma);
  const chat = new ChatEvents(registry, prisma);
  if (opts.members) (chat as any).members = new ChatMembersCache(opts.members);
  const gateway = new WebsocketGateway(
    registry,
    tokens,
    new SocketAuthenticator(registry, tokens, presence, support, prisma),
    presence,
    new TaskRooms(registry, prisma),
    new TaskEvents(registry, prisma),
    chat,
    support,
    new MemberEvents(registry),
  );
  return { gateway, registry, tokens, emitted, sockets, server, prisma };
}
