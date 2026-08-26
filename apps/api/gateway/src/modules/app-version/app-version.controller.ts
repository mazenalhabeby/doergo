import { Controller, Get } from '@nestjs/common';
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
  getVersion() {
    return {
      /**
       * Below this, the app refuses to run. Empty by default: a gate that
       * blocks the moment it is deployed, before anyone has been given a
       * version to move to, is how you lock out your own users.
       */
      minimum: process.env.MOBILE_MIN_VERSION || null,
      /** What is current — drives "an update is available", not a block. */
      latest: process.env.MOBILE_LATEST_VERSION || null,
      downloads: {
        android: process.env.MOBILE_ANDROID_URL || null,
        ios: process.env.MOBILE_IOS_URL || null,
      },
    };
  }
}
