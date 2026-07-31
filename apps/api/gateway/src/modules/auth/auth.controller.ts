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
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { LoginDto, RegisterDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, DeleteAccountDto } from './dto';
import { Public } from '../../common/decorators';
import { CurrentUser, CurrentUserData, SkipOnboardingCheck, AllowCustomer, SERVICE_NAMES } from '@hbcfield/shared';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
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
    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

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
      }),
    );

    // Check if the result is an error response
    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.UNAUTHORIZED,
      );
    }

    // Set refresh token as httpOnly cookie (web clients)
    if (result?.data?.refreshToken) {
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('refreshToken', result.data.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
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

    return result;
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
    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Set new refresh token cookie (token rotation)
    if (result?.data?.refreshToken) {
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('refreshToken', result.data.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    return result;
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
      this.authClient.send({ cmd: 'logout' }, { refreshToken }),
    );

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

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

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

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
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

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

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

    if (result?.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Delete('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all other sessions (keep current)' })
  async revokeAllSessions(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'revoke_all_sessions' }, { userId: user.id }),
    );
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

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }
}
