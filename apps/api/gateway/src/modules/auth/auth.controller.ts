import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Post, Get, Body, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthTokenCache, secondsUntilExp } from '../../common/cache/auth-token-cache.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LoginDto, RegisterDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto } from './dto';
import { Public } from '../../common/decorators';
import { CurrentUser, SkipOnboardingCheck, AllowCustomer, assertServiceOk } from '@hbcfield/shared';
import { setRefreshCookie, isBrowserClient, withoutRefreshTokenForBrowser } from './auth-controller-helpers';
import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  presenceChangedEvent,
} from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';

export { isBrowserClient, withoutRefreshTokenForBrowser } from './auth-controller-helpers';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly services: ServiceCalls,
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

    const result = await this.services.auth.ask(register, securePayload);

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
    const result = await this.services.auth.ask(login, {
      ...loginDto,
      userAgent: req.headers['user-agent'],
      // Node joins a repeated header into one string; Express types it string | string[].
      ipAddress: (req.ip || req.headers['x-forwarded-for']) as string | undefined,
      // Which app is asking, so a member restricted to one surface is turned
      // away here with a reason rather than signing in to a session that then
      // fails on every request. Absent for clients that predate the header.
      clientPlatform: req.headers['x-client-platform'] as string | undefined,
    });

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
      this.services.notification.tell(presenceChangedEvent, {
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
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Read refresh token from httpOnly cookie (web) or body (mobile)
    const refreshToken = req.cookies?.refreshToken || refreshTokenDto.refreshToken;

    const result = await this.services.auth.ask(refresh, { refreshToken });

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
  async logout(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Read refresh token from cookie or body
    const refreshToken = req.cookies?.refreshToken || refreshTokenDto.refreshToken;

    // Clear the httpOnly cookie — path MUST match the one used when setting it
    // ('/'), otherwise the browser keeps the cookie after logout.
    res.clearCookie('refreshToken', { path: '/' });

    const result = await this.services.auth.ask(logout, { refreshToken, pushToken: refreshTokenDto.pushToken });

    // Kill the cached session immediately so a still-valid access token can't be
    // replayed after logout (access tokens aren't otherwise revocable). (Sec audit H6.)
    if (result?.userId) await this.authCache.invalidateUser(result.userId);

    // ⚠️ Clearing the cache alone did NOT end the access token: the next request
    // simply re-validated it (it is a JWT, valid until `exp`) and got 200 — found
    // by testing, 2026-10-10. Mark THIS token signed out for the rest of its life.
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    if (bearer) await this.authCache.revoke(bearer, secondsUntilExp(bearer) ?? 0);

    // Signing out clears the user's lastActiveAt (done in auth-service), so they
    // read as offline immediately. Broadcast a presence event so teammates'
    // dashboards move them to "Off Duty" in real time instead of waiting for the
    // 3-minute online window to lapse. Sign-out ≠ clock-out — attendance is
    // untouched.
    if (result?.userId && result?.organizationId) {
      this.services.notification.tell(presenceChangedEvent, {
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
    const result = await this.services.auth.ask(forgotPassword, forgotPasswordDto);

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
    const result = await this.services.auth.ask(resetPassword, resetPasswordDto);

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

  @SkipOnboardingCheck()
  @AllowCustomer()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() user: SessionUser) {
    return {
      success: true,
      data: user,
    };
  }
}
