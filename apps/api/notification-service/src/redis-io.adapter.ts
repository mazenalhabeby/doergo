import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext, Logger } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * Socket.IO adapter backed by Redis pub/sub.
 *
 * Without this, `server.to(room).emit(...)` only reaches sockets connected to the
 * SAME notification-service instance, so with >1 instance most realtime updates
 * are silently dropped (and the round-robin `@EventPattern` consumer makes it
 * worse). With the Redis adapter every emit fans out across all instances, so a
 * client receives events no matter which node it (or the event producer) is on.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('RedisIoAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(): void {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.REDIS_PORT) || 6379;
    const pubClient = new Redis({ host, port });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (e) => this.logger.warn(`pub client error: ${e.message}`));
    subClient.on('error', (e) => this.logger.warn(`sub client error: ${e.message}`));
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log(`Socket.IO Redis adapter wired (${host}:${port})`);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
