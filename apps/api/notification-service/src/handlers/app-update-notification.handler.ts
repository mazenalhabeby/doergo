import { Controller, Logger, OnModuleDestroy } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import Redis from 'ioredis';
import { PrismaService, compareAppVersions, getRedisConfig } from '@hbcfield/shared';
import { PushService } from '../modules/push/push.service';
import { msg } from '../i18n/translate';

/**
 * "HBCField 1.0.7 is ready" — once per person per version, only to people whose app is older.
 *
 * Who is "older" comes from `User.lastAppVersion` (the gateway records it off every app request),
 * so a phone that updated by itself reads old until it is opened — the notice then asks somebody
 * already up to date at worst once, and tapping it shows nothing because the page only opens on an
 * older app. Who was told is kept in Redis per version, so a second run reaches only new names.
 */
@Controller()
export class AppUpdateNotificationHandler implements OnModuleDestroy {
  private readonly logger = new Logger(AppUpdateNotificationHandler.name);
  private readonly redis = new Redis({
    ...getRedisConfig(),
    lazyConnect: true,
  });

  constructor(private readonly prisma: PrismaService, private readonly push: PushService) {}

  onModuleDestroy() { this.redis.disconnect(); }

  @MessagePattern({ cmd: 'app_update_notice' })
  async notify(@Payload() data: { version: string; dryRun?: boolean }) {
    const version = String(data?.version ?? '').trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) return { success: false, statusCode: 400, message: 'A version like 1.0.7 is required' };
    const key = `app-update-notice:${version}`;

    const users = await this.prisma.user.findMany({
      where: { isActive: true, lastAppVersion: { not: null } },
      select: {
        id: true, firstName: true, lastName: true, lastAppVersion: true, lastAppPlatform: true,
        organization: { select: { name: true, suspendedAt: true } },
        _count: { select: { pushTokens: true } },
      },
    });
    const told = new Set(await this.redis.smembers(key).catch(() => [] as string[]));
    const older = users.filter((u) => u.lastAppVersion && compareAppVersions(u.lastAppVersion, version) < 0 && !u.organization?.suspendedAt);
    const due = older.filter((u) => !told.has(u.id) && u._count.pushTokens > 0);
    const list = (xs: typeof older) => xs.map((u) => ({ name: `${u.firstName} ${u.lastName}`.trim(), version: u.lastAppVersion, platform: u.lastAppPlatform, organization: u.organization?.name ?? null }));

    if (data.dryRun !== false) {
      return {
        success: true, dryRun: true, version,
        olderApps: older.length, wouldNotify: list(due),
        alreadyTold: older.filter((u) => told.has(u.id)).length,
        noNotifications: list(older.filter((u) => u._count.pushTokens === 0)),
      };
    }

    const result = await this.push.sendToNewestDevice(
      due.map((u) => u.id),
      { title: msg('app.update.title', { version }), body: msg('app.update.body') },
      { type: 'app_update', version },
    );
    const reached = result.reached ?? [];
    if (reached.length) await this.redis.sadd(key, ...reached).then(() => this.redis.expire(key, 180 * 86400)).catch((e) => this.logger.warn(`Could not record who was told: ${e.message}`));
    this.logger.log(`[APP_UPDATE] ${version}: ${result.sent} sent, ${result.failed} failed, ${reached.length} people`);
    return { success: true, dryRun: false, version, sent: result.sent, failed: result.failed, people: reached.length };
  }
}
