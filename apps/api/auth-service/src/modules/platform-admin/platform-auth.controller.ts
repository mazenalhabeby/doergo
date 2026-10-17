import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformTwoFactorService } from './platform-two-factor.service';
import { PlatformStaffService } from './platform-staff.service';

import {
  pattern,
  platformLogin,
  platformValidateToken,
  platformMe,
  platformUsersList,
  platformUsersCreate,
  platformUsersUpdate,
  platformUsersResetPassword,
  platformBootstrapOwner,
  platformChangePassword,
  platform2faSetup,
  platform2faEnable,
  platform2faDisable,
  platformUsersReset2fa,
  platformLogout,
  platformRefresh,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class PlatformAuthController {
  constructor(
    private readonly svc: PlatformAuthService,
    private readonly staff: PlatformStaffService,
    private readonly twoFactor: PlatformTwoFactorService,
  ) {}

  @MessagePattern(pattern(platformLogin))
  login(@Payload() d: RpcRequest<typeof platformLogin>) {
    return this.svc.login(d);
  }

  @MessagePattern(pattern(platformValidateToken))
  validate(@Payload() d: RpcRequest<typeof platformValidateToken>) {
    return this.svc.validateToken(d.token);
  }

  @MessagePattern(pattern(platformMe))
  me(@Payload() d: RpcRequest<typeof platformMe>) {
    return this.svc.me(d.userId);
  }

  @MessagePattern(pattern(platformUsersList))
  listUsers() {
    return this.staff.listUsers();
  }

  @MessagePattern(pattern(platformUsersCreate))
  createUser(@Payload() d: RpcRequest<typeof platformUsersCreate>) {
    return this.staff.createUser(d);
  }

  @MessagePattern(pattern(platformUsersUpdate))
  updateUser(@Payload() d: RpcRequest<typeof platformUsersUpdate>) {
    return this.staff.updateUser(d);
  }

  @MessagePattern(pattern(platformUsersResetPassword))
  resetPassword(@Payload() d: RpcRequest<typeof platformUsersResetPassword>) {
    return this.staff.resetPassword(d);
  }

  @MessagePattern(pattern(platformBootstrapOwner))
  bootstrap(@Payload() d: RpcRequest<typeof platformBootstrapOwner>) {
    return this.staff.bootstrapOwner(d);
  }

  @MessagePattern(pattern(platformChangePassword))
  changePassword(@Payload() d: RpcRequest<typeof platformChangePassword>) {
    return this.svc.changePassword(d);
  }

  @MessagePattern(pattern(platform2faSetup))
  setup2fa(@Payload() d: RpcRequest<typeof platform2faSetup>) {
    return this.twoFactor.setup2fa(d);
  }

  @MessagePattern(pattern(platform2faEnable))
  enable2fa(@Payload() d: RpcRequest<typeof platform2faEnable>) {
    return this.twoFactor.enable2fa(d);
  }

  @MessagePattern(pattern(platform2faDisable))
  disable2fa(@Payload() d: RpcRequest<typeof platform2faDisable>) {
    return this.twoFactor.disable2fa(d);
  }

  @MessagePattern(pattern(platformUsersReset2fa))
  reset2fa(@Payload() d: RpcRequest<typeof platformUsersReset2fa>) {
    return this.twoFactor.reset2fa(d);
  }

  @MessagePattern(pattern(platformLogout))
  logout(@Payload() d: RpcRequest<typeof platformLogout>) {
    return this.svc.logout(d);
  }

  @MessagePattern(pattern(platformRefresh))
  refresh(@Payload() d: RpcRequest<typeof platformRefresh>) {
    return this.svc.refresh(d);
  }
}
