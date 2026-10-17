import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { BiometricService } from './biometric.service';
import { SessionControlService } from './session-control.service';

import {
  pattern,
  authHealth,
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  validateToken,
  changePassword,
  updateAvatar,
  removeAvatar,
  listSessions,
  revokeSession,
  revokeAllSessions,
  deleteAccount,
  platformMailStatus,
  biometricEnroll,
  biometricChallenge,
  biometricVerify,
  biometricDevices,
  biometricRevoke,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionControl: SessionControlService,
    private readonly biometric: BiometricService,
  ) {}

  // Its OWN pattern: on the shared Redis transport a common 'health' was answered
  // by whichever service replied first, so the gateway could not tell who was up.
  @MessagePattern(pattern(authHealth))
  async health() {
    return { status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() };
  }

  @MessagePattern(pattern(register))
  async register(@Payload() data: RpcRequest<typeof register>) {
    return this.authService.register(data);
  }

  @MessagePattern(pattern(login))
  async login(@Payload() data: RpcRequest<typeof login>) {
    return this.authService.login(data);
  }

  @MessagePattern(pattern(refresh))
  async refresh(@Payload() data: RpcRequest<typeof refresh>) {
    return this.authService.refresh(data.refreshToken);
  }

  @MessagePattern(pattern(logout))
  async logout(@Payload() data: RpcRequest<typeof logout>) {
    return this.sessionControl.logout(data.refreshToken, data.pushToken);
  }

  @MessagePattern(pattern(forgotPassword))
  async forgotPassword(@Payload() data: RpcRequest<typeof forgotPassword>) {
    return this.authService.forgotPassword(data);
  }

  @MessagePattern(pattern(resetPassword))
  async resetPassword(@Payload() data: RpcRequest<typeof resetPassword>) {
    return this.authService.resetPassword(data);
  }

  @MessagePattern(pattern(validateToken))
  async validateToken(@Payload() data: RpcRequest<typeof validateToken>) {
    return this.authService.validateToken(data.token);
  }

  @MessagePattern(pattern(changePassword))
  async changePassword(@Payload() data: RpcRequest<typeof changePassword>) {
    return this.authService.changePassword(data);
  }

  @MessagePattern(pattern(updateAvatar))
  async updateAvatar(@Payload() data: RpcRequest<typeof updateAvatar>) {
    return this.authService.updateAvatar(data);
  }

  @MessagePattern(pattern(removeAvatar))
  async removeAvatar(@Payload() data: RpcRequest<typeof removeAvatar>) {
    return this.authService.removeAvatar(data);
  }

  @MessagePattern(pattern(listSessions))
  async listSessions(@Payload() data: RpcRequest<typeof listSessions>) {
    return this.sessionControl.listSessions(data.userId);
  }

  @MessagePattern(pattern(revokeSession))
  async revokeSession(@Payload() data: RpcRequest<typeof revokeSession>) {
    return this.sessionControl.revokeSession(data.userId, data.sessionId);
  }

  @MessagePattern(pattern(revokeAllSessions))
  async revokeAllSessions(@Payload() data: RpcRequest<typeof revokeAllSessions>) {
    return this.sessionControl.revokeAllSessions(data.userId, data.exceptSessionId, data.currentRefreshToken);
  }

  @MessagePattern(pattern(deleteAccount))
  async deleteAccount(@Payload() data: RpcRequest<typeof deleteAccount>) {
    return this.authService.deleteAccount(data);
  }

  // Operator-only: is outbound email working? See AuthService.mailHealth.
  @MessagePattern(pattern(platformMailStatus))
  mailStatus() {
    return this.authService.mailHealth();
  }

  /*
    Biometric sign-in.

    ⚠️ `enroll` and `revoke` take `userId` from the payload, and the GATEWAY is
    what puts it there — from the verified access token, never from the client
    body. This service is behind Redis and trusts its caller; the gateway is the
    boundary that must not be bypassed.
  */
  @MessagePattern(pattern(biometricEnroll))
  async biometricEnroll(@Payload() data: RpcRequest<typeof biometricEnroll>) {
    return this.biometric.enroll(data.userId, data);
  }

  @MessagePattern(pattern(biometricChallenge))
  async biometricChallenge(@Payload() data: RpcRequest<typeof biometricChallenge>) {
    return this.biometric.challenge(data.deviceId);
  }

  @MessagePattern(pattern(biometricVerify))
  async biometricVerify(@Payload() data: RpcRequest<typeof biometricVerify>) {
    return this.biometric.verify(data, { userAgent: data.userAgent, ipAddress: data.ipAddress });
  }

  @MessagePattern(pattern(biometricDevices))
  async biometricDevices(@Payload() data: RpcRequest<typeof biometricDevices>) {
    return this.biometric.list(data.userId);
  }

  @MessagePattern(pattern(biometricRevoke))
  async biometricRevoke(@Payload() data: RpcRequest<typeof biometricRevoke>) {
    return this.biometric.revoke(data.userId, data.deviceId);
  }
}
