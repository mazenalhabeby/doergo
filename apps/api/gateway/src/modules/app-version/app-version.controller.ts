import { Body, Controller, Get, HttpException, HttpStatus, Inject, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { SERVICE_NAMES, releaseNoteFor } from '@hbcfield/shared';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';

/**
 * What version of the mobile app is still allowed to talk to this API.
 *
 * Sideloaded Android builds do not auto-update — the APK is served from our own
 * site, so a phone installed once stays on that build forever. That is why the
 * update history carries a separate "1.0.0 train": a fleet that cannot be moved
 * forward, only published to, indefinitely.
 *
 * This endpoint is the way to end that: the app asks what it must be, and shows
 * a blocking screen when it is older. Deliberately PUBLIC — a user stuck on a
 * build too old to log in still has to be told why.
 */
@ApiTags('app')
@Controller('app')
export class AppVersionController {
  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Minimum and current mobile app version, with download links' })
  getVersion(@Query('lang') lang?: string) {
    const latest = process.env.MOBILE_LATEST_VERSION || null;
    return {
      /**
       * Below this, the app refuses to run. Empty by default: a gate that
       * blocks the moment it is deployed, before anyone has been given a
       * version to move to, is how you lock out your own users.
       */
      minimum: process.env.MOBILE_MIN_VERSION || null,
      /** What is current — drives "an update is available", not a block. */
      latest,
      /**
       * What is new in `latest`, in the reader's language — the full-page update's words. Served
       * here, not bundled, because the page runs in the OLD app (shared app-release/release-notes).
       */
      whatsNew: releaseNoteFor(latest, lang),
      downloads: {
        android: process.env.MOBILE_ANDROID_URL || null,
        ios: process.env.MOBILE_IOS_URL || null,
      },
    };
  }
}

/**
 * "A new version is ready" — ONE notification per person still on an older app, to their newest
 * phone, in their language, and never twice for the same version. Platform operator only (the
 * secret header): it reaches people in every organization. `dryRun: true` lists who would get it.
 */
@ApiTags('app')
@Controller('platform/app-update')
export class AppUpdateNoticeController {
  constructor(@Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy) {}

  @Public()
  @UseGuards(PlatformAdminGuard)
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('notify')
  @ApiOperation({ summary: 'Notify people on an older app version (once per version)' })
  async notify(@Body() body: { dryRun?: boolean }) {
    const version = process.env.MOBILE_LATEST_VERSION;
    if (!version) throw new HttpException({ message: 'MOBILE_LATEST_VERSION is not set' }, HttpStatus.BAD_REQUEST);
    return firstValueFrom(this.notificationClient.send({ cmd: 'app_update_notice' }, { version, dryRun: body?.dryRun !== false }));
  }
}
