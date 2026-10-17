import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext, Logger } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { getRedisConfig } from '@hbcfield/shared';
import type { Server } from 'socket.io';

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
  private readonly redisLogger = new Logger('RedisIoAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(): void {
    const redis = getRedisConfig();
    const pubClient = new Redis(redis);
    const subClient = pubClient.duplicate();
    pubClient.on('error', (e) => this.redisLogger.warn(`pub client error: ${e.message}`));
    subClient.on('error', (e) => this.redisLogger.warn(`sub client error: ${e.message}`));
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.redisLogger.log(`Socket.IO Redis adapter wired (${redis.host}:${redis.port})`);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
