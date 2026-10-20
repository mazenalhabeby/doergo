import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  accessRolesEnsureBuiltIns,
  spaceRoleCreate,
  spaceRoleUpdate,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { AccessRolesService } from './access-roles.service';
import { SpaceRoleWritesService } from './space-role-writes.service';

/** task-service's workspace-role screens ask here: auth-service owns AccessRole (docs/data-ownership.md, group D). */
@Controller()
export class SpaceRoleWritesController {
  constructor(
    private readonly roles: AccessRolesService,
    private readonly writes: SpaceRoleWritesService,
  ) {}

  @MessagePattern(pattern(accessRolesEnsureBuiltIns))
  async ensureBuiltIns(@Payload() data: RpcRequest<typeof accessRolesEnsureBuiltIns>) {
    await this.roles.ensureBuiltInRoles(data.organizationId);
    return { success: true };
  }

  @MessagePattern(pattern(spaceRoleCreate))
  create(@Payload() data: RpcRequest<typeof spaceRoleCreate>) {
    return this.writes.create(data);
  }

  @MessagePattern(pattern(spaceRoleUpdate))
  update(@Payload() data: RpcRequest<typeof spaceRoleUpdate>) {
    return this.writes.update(data);
  }
}
