import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformAuthService } from './platform-auth.service';

@Controller()
export class PlatformAuthController {
  constructor(private readonly svc: PlatformAuthService) {}

  @MessagePattern({ cmd: 'platform_login' })
  login(@Payload() d: any) { return this.svc.login(d); }

  @MessagePattern({ cmd: 'platform_validate_token' })
  validate(@Payload() d: { token: string }) { return this.svc.validateToken(d.token); }

  @MessagePattern({ cmd: 'platform_me' })
  me(@Payload() d: { userId: string }) { return this.svc.me(d.userId); }

  @MessagePattern({ cmd: 'platform_users_list' })
  listUsers() { return this.svc.listUsers(); }

  @MessagePattern({ cmd: 'platform_users_create' })
  createUser(@Payload() d: any) { return this.svc.createUser(d); }

  @MessagePattern({ cmd: 'platform_users_update' })
  updateUser(@Payload() d: any) { return this.svc.updateUser(d); }

  @MessagePattern({ cmd: 'platform_users_reset_password' })
  resetPassword(@Payload() d: any) { return this.svc.resetPassword(d); }

  @MessagePattern({ cmd: 'platform_bootstrap_owner' })
  bootstrap(@Payload() d: any) { return this.svc.bootstrapOwner(d); }

  @MessagePattern({ cmd: 'platform_change_password' })
  changePassword(@Payload() d: any) { return this.svc.changePassword(d); }

  @MessagePattern({ cmd: 'platform_2fa_setup' })
  setup2fa(@Payload() d: any) { return this.svc.setup2fa(d); }

  @MessagePattern({ cmd: 'platform_2fa_enable' })
  enable2fa(@Payload() d: any) { return this.svc.enable2fa(d); }

  @MessagePattern({ cmd: 'platform_2fa_disable' })
  disable2fa(@Payload() d: any) { return this.svc.disable2fa(d); }
}
