import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { LoginDto, RegisterDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, DeleteAccountDto } from './dto';
import { Public } from '../../common/decorators';
import { CurrentUser, CurrentUserData, SkipOnboardingCheck, AllowCustomer, SERVICE_NAMES, assertServiceOk } from '@hbcfield/shared';

const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** The httpOnly refresh cookie — one definition for sign-in and rotation. */
function setRefreshCookie(res: Response, refreshToken: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

/**
 * Is this request from the web app?
 *
 * The web names itself two ways: `client: 'web'` in the sign-in body (it picks
 * the session length) and `X-Client-Platform: web` on every other request. The
 * phone sends `mobile` or — older builds — nothing at all, and must keep
 * receiving the refresh token in the body: it has no cookie jar and keeps the
 * token in SecureStore. So the default is "not a browser".
 */
export function isBrowserClient(req: Request, body?: { client?: string } | null): boolean {
  const header = String(req.headers['x-client-platform'] ?? '').toLowerCase().trim();
  return header === 'web' || String(body?.client ?? '').toLowerCase().trim() === 'web';
}

/**
 * Take the refresh token out of a JSON answer meant for a browser.
 *
 * The browser already holds it in the httpOnly cookie set beside this answer
 * — the one place script cannot read it. Putting the same token in the body as
 * well handed it to any script running on the page, which is exactly the XSS
 * the cookie exists to defeat: a durable credential, readable for 30 days.
 */
export function withoutRefreshTokenForBrowser<T extends { data?: any } | null | undefined>(result: T, browser: boolean): T {
  if (!browser || !result?.data || !('refreshToken' in result.data)) return result;
  const { refreshToken: _omit, ...data } = result.data;
  return { ...result, data } as T;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly authCache: AuthTokenCache,
  ) {}

  @Public()
  @Post('register')
  // Stricter rate limit for registration: 5 attempts per minute
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new partner account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(@Body() registerDto: RegisterDto) {
    // SECURITY: Always set role to ADMIN - never trust client input for role
    // Self-registered users become ADMIN of their own organization
    const securePayload = {
      ...registerDto,
      role: 'ADMIN',
    };

    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'register' }, securePayload),
    );

    // Check if the result is an error response
    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Stricter rate limit for login: 5 attempts per minute to prevent brute force
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many requests - account temporarily locked' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'login' }, {
        ...loginDto,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        // Which app is asking, so a member restricted to one surface is turned
        // away here with a reason rather than signing in to a session that then
        // fails on every request. Absent for clients that predate the header.
        clientPlatform: req.headers['x-client-platform'],
      }),
    );

    // Check if the result is an error response
    assertServiceOk(result, HttpStatus.UNAUTHORIZED);

    // Set refresh token as httpOnly cookie (web clients)
    if (result?.data?.refreshToken) {
      setRefreshCookie(res, result.data.refreshToken);
    }

    // Signing in sets the user Available + active (done in auth-service).
    // Broadcast a presence event so teammates' dashboards move them online
    // (Off Duty → Off-shift/Present) in real time.
    const loggedIn = result?.data?.user;
    if (loggedIn?.id && loggedIn?.organizationId) {
      this.notificationClient.emit('presence_changed', {
        userId: loggedIn.id,
        presence: loggedIn.presence ?? 'AVAILABLE',
        organizationId: loggedIn.organizationId,
      });
    }

    return withoutRefreshTokenForBrowser(result, isBrowserClient(req, loginDto));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Read refresh token from httpOnly cookie (web) or body (mobile)
    const refreshToken = req.cookies?.refreshToken || refreshTokenDto.refreshToken;

    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'refresh' }, { refreshToken }),
    );

    // Check if the result is an error response
    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    // Set new refresh token cookie (token rotation)
    if (result?.data?.refreshToken) {
      setRefreshCookie(res, result.data.refreshToken);
    }

    // A token that ARRIVED in the cookie came from a browser: answer it the
    // browser's way, whatever the headers say.
    const cameFromCookie = !!req.cookies?.refreshToken && !refreshTokenDto.refreshToken;
    return withoutRefreshTokenForBrowser(result, cameFromCookie || isBrowserClient(req));
  }

  @SkipOnboardingCheck()
  @AllowCustomer()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Read refresh token from cookie or body
    const refreshToken = req.cookies?.refreshToken || refreshTokenDto.refreshToken;

    // Clear the httpOnly cookie — path MUST match the one used when setting it
    // ('/'), otherwise the browser keeps the cookie after logout.
    res.clearCookie('refreshToken', { path: '/' });

    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'logout' }, { refreshToken, pushToken: refreshTokenDto.pushToken }),
    );

    // Kill the cached session immediately so a still-valid access token can't be
    // replayed after logout (access tokens aren't otherwise revocable). (Sec audit H6.)
    if (result?.userId) await this.authCache.invalidateUser(result.userId);

    // Signing out clears the user's lastActiveAt (done in auth-service), so they
    // read as offline immediately. Broadcast a presence event so teammates'
    // dashboards move them to "Off Duty" in real time instead of waiting for the
    // 3-minute online window to lapse. Sign-out ≠ clock-out — attendance is
    // untouched.
    if (result?.userId && result?.organizationId) {
      this.notificationClient.emit('presence_changed', {
        userId: result.userId,
        presence: null,
        organizationId: result.organizationId,
      });
    }

    return { success: true, message: 'Logged out successfully' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  // Strict rate limit: 3 requests per minute to prevent abuse
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Password reset email sent if account exists' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'forgot_password' }, forgotPasswordDto),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    return result;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  // Rate limit: 5 attempts per minute
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Reset password using token from email' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'reset_password' }, resetPasswordDto),
    );

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    /*
      A reset is what somebody does when they think their account is in
      somebody else's hands. auth-service has moved the session cut-off; the
      cached session would otherwise keep passing the guard chain for up to
      AUTH_CACHE_TTL_SECONDS. The member id is for us only — this route is
      public, so it is stripped before answering.
    */
    const { userId: resetUserId, ...answer } = result ?? {};
    if (resetUserId) await this.authCache.invalidateUser(resetUserId);

    return answer;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password or weak new password' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'change_password' }, {
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

  @SkipOnboardingCheck()
  @AllowCustomer()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() user: CurrentUserData) {
    return {
      success: true,
      data: user,
    };
  }

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for current user' })
  async listSessions(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'list_sessions' }, { userId: user.id }),
    );
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result: any = await firstValueFrom(
      this.authClient.send({ cmd: 'revoke_session' }, { userId: user.id, sessionId }),
    );

    assertServiceOk(result, HttpStatus.NOT_FOUND);

    return result;
  }

  @Delete('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all other sessions (keep current)' })
  async revokeAllSessions(
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
    @Body() body: RefreshTokenDto,
  ) {
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
      this.authClient.send({ cmd: 'revoke_all_sessions' }, { userId: user.id, currentRefreshToken }),
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
  async deleteAccount(
    @Body() dto: DeleteAccountDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'delete_account' }, {
        userId: user.id,
        password: dto.password,
      }),
    );

    // Account deleted → drop the cached session (Sec audit H6).
    if (result?.success !== false) await this.authCache.invalidateUser(user.id);

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return result;
  }

  // ── Biometric sign-in ───────────────────────────────────────────────────
  /*
    ⚠️ THIS IS THE BOUNDARY. `userId` is taken from the VERIFIED access token
    (`@CurrentUser`), never from the request body. auth-service sits behind
    Redis and trusts whatever it is handed — if a client could name the user it
    is enrolling a key for, biometric sign-in would be account takeover rather
    than a convenience.
  */
  @Post('biometric/enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bind this device to the signed-in member' })
  async biometricEnroll(@CurrentUser() user: CurrentUserData, @Body() body: any) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'biometric_enroll' }, { ...body, userId: user.id }),
    );
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  /*
    Public, because the whole point is that there is no session yet — and it
    reveals nothing: the nonce is random, and it is issued whether or not the
    device is known. The signature check is the gate.

    Rate-limited hard: this is the one unauthenticated write in the flow.
  */
  @Public()
  @Post('biometric/challenge')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get a one-time challenge to sign' })
  async biometricChallenge(@Body() body: { deviceId: string }) {
    return firstValueFrom(this.authClient.send({ cmd: 'biometric_challenge' }, body));
  }

  @Public()
  @Post('biometric/verify')
  @HttpCode(HttpStatus.OK)
  // Same ceiling as password login: this mints a full session.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Sign in with a device signature' })
  async biometricVerify(@Body() body: { deviceId: string; signature: string }, @Req() req: Request) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'biometric_verify' }, {
        ...body,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.headers['x-forwarded-for'],
      }),
    );
    assertServiceOk(result, HttpStatus.UNAUTHORIZED);
    return result;
  }

  @Get('devices')
  @ApiOperation({ summary: 'Devices that can sign in without a password' })
  async biometricDevices(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(this.authClient.send({ cmd: 'biometric_devices' }, { userId: user.id }));
  }

  /** The lost-phone button. Scoped to the caller's own devices by `user.id`. */
  @Delete('devices/:deviceId')
  @ApiOperation({ summary: 'Revoke a device' })
  async biometricRevoke(@CurrentUser() user: CurrentUserData, @Param('deviceId') deviceId: string) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'biometric_revoke' }, { userId: user.id, deviceId }),
    );
  }

}
