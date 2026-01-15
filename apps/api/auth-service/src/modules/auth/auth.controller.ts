import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
