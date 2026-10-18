import { Controller, Post, Get, Delete, Body, Param, Req, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { Public } from '../../common/decorators';
import { CurrentUser, CurrentUserData, assertServiceOk } from '@hbcfield/shared';
import {
  sendRpc,
  biometricEnroll,
  biometricChallenge,
  biometricVerify,
  biometricDevices,
  biometricRevoke,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';
import { BiometricEnrollDto, BiometricChallengeDto, BiometricVerifyDto } from './dto/biometric.dto';

/**
 * /auth — signing in with Face ID / fingerprint: enrolling a device, the
 * challenge, verifying, the devices, revoking one.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthBiometricController {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

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
  async biometricEnroll(@CurrentUser() user: SessionUser, @Body() body: BiometricEnrollDto) {
    const result = await firstValueFrom(sendRpc(this.authClient, biometricEnroll, { ...body, userId: user.id }));
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
  async biometricChallenge(@Body() body: BiometricChallengeDto) {
    return firstValueFrom(sendRpc(this.authClient, biometricChallenge, body));
  }

  @Public()
  @Post('biometric/verify')
  @HttpCode(HttpStatus.OK)
  // Same ceiling as password login: this mints a full session.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Sign in with a device signature' })
  async biometricVerify(@Body() body: BiometricVerifyDto, @Req() req: Request) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, biometricVerify, {
        ...body,
        userAgent: req.headers['user-agent'],
        // Node joins a repeated header into one string; Express types it string | string[].
        ipAddress: (req.ip || req.headers['x-forwarded-for']) as string | undefined,
      }),
    );
    assertServiceOk(result, HttpStatus.UNAUTHORIZED);
    return result;
  }

  @Get('devices')
  @ApiOperation({ summary: 'Devices that can sign in without a password' })
  async biometricDevices(@CurrentUser() user: SessionUser) {
    return firstValueFrom(sendRpc(this.authClient, biometricDevices, { userId: user.id }));
  }

  /** The lost-phone button. Scoped to the caller's own devices by `user.id`. */
  @Delete('devices/:deviceId')
  @ApiOperation({ summary: 'Revoke a device' })
  async biometricRevoke(@CurrentUser() user: SessionUser, @Param('deviceId') deviceId: string) {
    return firstValueFrom(sendRpc(this.authClient, biometricRevoke, { userId: user.id, deviceId }));
  }
}
