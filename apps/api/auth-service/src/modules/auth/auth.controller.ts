import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { BiometricService } from './biometric.service';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly biometric: BiometricService,
  ) {}

  @MessagePattern({ cmd: 'health' })
  async health() {
    return { status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() };
  }

  @MessagePattern({ cmd: 'register' })
  async register(@Payload() data: any) {
    return this.authService.register(data);
  }

  @MessagePattern({ cmd: 'login' })
  async login(@Payload() data: any) {
    return this.authService.login(data);
  }

  @MessagePattern({ cmd: 'refresh' })
  async refresh(@Payload() data: any) {
    return this.authService.refresh(data.refreshToken);
  }

  @MessagePattern({ cmd: 'logout' })
  async logout(@Payload() data: any) {
    return this.authService.logout(data.refreshToken);
  }

  @MessagePattern({ cmd: 'forgot_password' })
  async forgotPassword(@Payload() data: any) {
    return this.authService.forgotPassword(data);
  }

  @MessagePattern({ cmd: 'reset_password' })
  async resetPassword(@Payload() data: any) {
    return this.authService.resetPassword(data);
  }

  @MessagePattern({ cmd: 'validate_token' })
  async validateToken(@Payload() data: any) {
    return this.authService.validateToken(data.token);
  }

  @MessagePattern({ cmd: 'change_password' })
  async changePassword(@Payload() data: any) {
    return this.authService.changePassword(data);
  }

  @MessagePattern({ cmd: 'update_avatar' })
  async updateAvatar(@Payload() data: any) {
    return this.authService.updateAvatar(data);
  }

  @MessagePattern({ cmd: 'remove_avatar' })
  async removeAvatar(@Payload() data: any) {
    return this.authService.removeAvatar(data);
  }

  @MessagePattern({ cmd: 'list_sessions' })
  async listSessions(@Payload() data: any) {
    return this.authService.listSessions(data.userId);
  }

  @MessagePattern({ cmd: 'revoke_session' })
  async revokeSession(@Payload() data: any) {
    return this.authService.revokeSession(data.userId, data.sessionId);
  }

  @MessagePattern({ cmd: 'revoke_all_sessions' })
  async revokeAllSessions(@Payload() data: any) {
    return this.authService.revokeAllSessions(data.userId, data.exceptSessionId);
  }

  @MessagePattern({ cmd: 'delete_account' })
  async deleteAccount(@Payload() data: any) {
    return this.authService.deleteAccount(data);
  }

  // Operator-only: is outbound email working? See AuthService.mailHealth.
  @MessagePattern({ cmd: 'platform_mail_status' })
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
  @MessagePattern({ cmd: 'biometric_enroll' })
  async biometricEnroll(@Payload() data: { userId: string; deviceId: string; publicKey: string; label: string; platform: string; secureHardware?: boolean }) {
    return this.biometric.enroll(data.userId, data);
  }

  @MessagePattern({ cmd: 'biometric_challenge' })
  async biometricChallenge(@Payload() data: { deviceId: string }) {
    return this.biometric.challenge(data.deviceId);
  }

  @MessagePattern({ cmd: 'biometric_verify' })
  async biometricVerify(@Payload() data: { deviceId: string; signature: string; userAgent?: string; ipAddress?: string }) {
    return this.biometric.verify(data, { userAgent: data.userAgent, ipAddress: data.ipAddress });
  }

  @MessagePattern({ cmd: 'biometric_devices' })
  async biometricDevices(@Payload() data: { userId: string }) {
    return this.biometric.list(data.userId);
  }

  @MessagePattern({ cmd: 'biometric_revoke' })
  async biometricRevoke(@Payload() data: { userId: string; deviceId: string }) {
    return this.biometric.revoke(data.userId, data.deviceId);
  }

}
