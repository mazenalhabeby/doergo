import { Controller, Post, Get, Delete, Body, Param, Req, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { RefreshTokenDto, ChangePasswordDto, DeleteAccountDto } from './dto';
import { CurrentUser, assertServiceOk } from '@hbcfield/shared';
import {
  sendRpc,
  changePassword,
  listSessions,
  revokeSession,
  revokeAllSessions,
  deleteAccount,
} from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';

/**
 * /auth — the caller's own account: changing the password, their sessions, signing
 * out elsewhere, deleting the account.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthSessionsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly authCache: AuthTokenCache,
  ) {}

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password or weak new password' })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, changePassword, {
        userId: user.id,
        currentPassword: dto.currentPassword,
        newPassword: dto.newPassword,
      }),
    );

    // Password change → drop the cached session (Sec audit H6).
    if (result?.success !== false) await this.authCache.invalidateUser(user.id);

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return result;
  }

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for current user' })
  async listSessions(@CurrentUser() user: SessionUser) {
    return firstValueFrom(sendRpc(this.authClient, listSessions, { userId: user.id }));
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(@Param('id') sessionId: string, @CurrentUser() user: SessionUser) {
    const result: any = await firstValueFrom(sendRpc(this.authClient, revokeSession, { userId: user.id, sessionId }));

    assertServiceOk(result, HttpStatus.NOT_FOUND);

    return result;
  }

  @Delete('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all other sessions (keep current)' })
  async revokeAllSessions(@CurrentUser() user: SessionUser, @Req() req: Request, @Body() body: RefreshTokenDto) {
    /*
      "Keep current" needs to know which session is current, and the gateway
      cannot name it: the access token carries no session claim, and a refresh
      token row is found only by its hash, inside auth-service. So the caller's
      own refresh token travels — the web's cookie, or the phone's body field,
      exactly as on logout — and auth-service resolves it to the row it keeps
      (`exceptSessionId` stays its parameter; this only supplies what it needs).
      Never trusted as anybody else's: auth-service matches it against THIS
      user's rows only.
    */
    const currentRefreshToken = req.cookies?.refreshToken || body?.refreshToken || undefined;
    const result = await firstValueFrom(
      sendRpc(this.authClient, revokeAllSessions, { userId: user.id, currentRefreshToken }),
    );
    /*
      The cut-off moved for the whole account, so the gateway's cached copy of
      this person's session must go too — otherwise the other devices keep
      being answered from the cache until it expires.
    */
    await this.authCache.invalidateUser(user.id).catch(() => undefined);
    return result;
  }

  // =========================================================================
  // ACCOUNT DELETION
  // =========================================================================

  @Delete('account')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Permanently delete the current user account' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid password or last admin' })
  async deleteAccount(@Body() dto: DeleteAccountDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, deleteAccount, {
        userId: user.id,
        password: dto.password,
      }),
    );

    // Account deleted → drop the cached session (Sec audit H6).
    if (result?.success !== false) await this.authCache.invalidateUser(user.id);

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return result;
  }
}
