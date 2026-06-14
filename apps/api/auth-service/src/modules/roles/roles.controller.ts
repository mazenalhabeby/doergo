import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @MessagePattern({ cmd: 'roles_find_all' })
  async findAll(@Payload() data: { organizationId: string }) {
    return this.rolesService.findAll(data.organizationId);
  }

  @MessagePattern({ cmd: 'roles_find_one' })
  async findOne(@Payload() data: { id: string; organizationId: string }) {
    return this.rolesService.findOne(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'roles_create' })
  async create(
    @Payload()
    data: {
      organizationId: string;
      name: string;
      description?: string;
      color?: string;
    },
  ) {
    return this.rolesService.create(data);
  }

  @MessagePattern({ cmd: 'roles_update' })
  async update(
    @Payload()
    data: {
      id: string;
      organizationId: string;
      name?: string;
      description?: string;
      color?: string;
    },
  ) {
    const { id, organizationId, ...rest } = data;
    return this.rolesService.update(id, organizationId, rest);
  }

  @MessagePattern({ cmd: 'roles_update_permissions' })
  async updatePermissions(
    @Payload()
    data: {
      id: string;
      organizationId: string;
      permissions: Record<string, any>;
    },
  ) {
    return this.rolesService.updatePermissions(data.id, data.organizationId, data.permissions);
  }

  @MessagePattern({ cmd: 'roles_delete' })
  async delete(@Payload() data: { id: string; organizationId: string }) {
    return this.rolesService.delete(data.id, data.organizationId);
  }
}
