import { ServiceCalls } from '../../common/microservices/service-calls';
import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { join } from 'path';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { CurrentUser, AllowCustomer } from '@hbcfield/shared';
import { StorageService } from '../../common/storage/storage.service';
import { RegisterPushTokenDto } from './users.dto';
import { updateAvatar, removeAvatar, registerPushToken, removePushToken } from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';

/** /users — the caller's own picture and the phones that receive their pushes. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserDevicesController {
  constructor(
    private readonly services: ServiceCalls,
    private readonly storage: StorageService,
  ) {}

  // =========================================================================
  // AVATAR (local file upload)
  // =========================================================================

  @Post('avatar/upload')
  @ApiOperation({ summary: 'Upload avatar image (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async avatarUpload(@CurrentUser() user: SessionUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 5MB)');
    }
    // The on-disk extension is derived from the validated MIME type, NOT from
    // the client-supplied filename. `uploads/` is served by express.static, which
    // sets Content-Type from the extension — deriving it from `originalname` would
    // let an attacker upload `x.html` (with an image mimetype header) and have it
    // served as text/html → stored XSS on the app origin. (Sec audit C3.)
    const MIME_EXT: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    }

    /*
      Object storage, so every gateway replica can serve it back. Writing to the
      container filesystem worked only because there has never been more than one
      replica — the second one 404s on anything the first received.

      Falls back to local disk when S3 is unconfigured, so a deployment without
      keys behaves as it always did.
    */
    const fileName = `${Date.now()}.${ext}`;
    let avatarUrl: string;
    if (this.storage.isConfigured) {
      avatarUrl = await this.storage.uploadPublicImage(`avatars/${user.id}/${fileName}`, file.buffer, file.mimetype);
    } else {
      const uploadDir = join(process.cwd(), 'uploads', 'avatars', user.id);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(join(uploadDir, fileName), file.buffer);
      avatarUrl = `/uploads/avatars/${user.id}/${fileName}`;
    }

    // Update user in database
    await this.services.auth.ask(updateAvatar, { userId: user.id, avatarUrl });

    return { success: true, data: { avatarUrl } };
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Remove avatar from user profile and local storage' })
  async avatarRemove(@CurrentUser() user: SessionUser) {
    // 1. Remove from DB and get old URL
    const result: any = await this.services.auth.ask(removeAvatar, { userId: user.id });

    // 2. Clean up the stored file, wherever it lives. Old avatars are still
    //    relative `/uploads/...` paths on disk; new ones are absolute S3 URLs.
    //    Both are handled, and neither failing affects the response.
    const oldUrl: string | undefined = result?.data?.oldAvatarUrl;
    if (oldUrl?.startsWith('/uploads/')) {
      try {
        await unlink(join(process.cwd(), oldUrl));
      } catch (err: unknown) {
        console.warn(
          `[AvatarRemove] Failed to delete local avatar for user ${user.id}: ${(err as Error | undefined)?.message}`,
        );
      }
    } else if (oldUrl) {
      await this.storage.deleteByUrl(oldUrl);
    }

    return result;
  }

  // =========================================================================
  // PUSH NOTIFICATIONS
  // =========================================================================

  @Post('push-token')
  @AllowCustomer() // portal customers register their device to get request-status pushes
  @ApiOperation({ summary: 'Register a push notification token for the current user' })
  @ApiBody({ type: RegisterPushTokenDto })
  async registerPushToken(@CurrentUser() user: SessionUser, @Body() dto: RegisterPushTokenDto) {
    return this.services.notification.ask(registerPushToken, {
      userId: user.id,
      token: dto.token,
      platform: dto.platform,
      deviceId: dto.deviceId,
      locale: dto.locale,
    });
  }

  @Delete('push-token/:token')
  @AllowCustomer() // portal customers unregister their device on logout
  @ApiOperation({ summary: 'Remove a push notification token' })
  async removePushToken(@Param('token') token: string, @CurrentUser() user: SessionUser) {
    return this.services.notification.ask(removePushToken, { token, userId: user.id });
  }
}
