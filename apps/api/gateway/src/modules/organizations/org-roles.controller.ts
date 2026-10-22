import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpStatus, UseInterceptors } from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, assertServiceOk } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { listAccessRoles, createAccessRole, updateAccessRole, deleteAccessRole } from '@hbcfield/shared/microservices';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';
import { CreateOrgRoleDto, UpdateOrgRoleDto } from './dto/org-bodies.dto';

/** /organizations/roles — the organization's access roles. */
@ApiTags('organizations')
@UseInterceptors(LabourCostInterceptor)
@Controller('organizations')
@ApiBearerAuth()
export class OrgRolesController {
  constructor(private readonly services: ServiceCalls) {}

  @Get('roles')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List assignable roles (org: Admin/Manager/custom · space: Space Manager/…)' })
  async listRoles(@CurrentUser() user: SessionUser, @Query('scope') scope?: string) {
    return this.services.auth.ask(listAccessRoles, {
      organizationId: callerOrgId(user),
      scope: scope === 'space' ? 'space' : 'org',
    });
  }

  @Post('roles')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a custom org-wide role' })
  async createRole(@Body() body: CreateOrgRoleDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(createAccessRole, {
      ...body,
      organizationId: callerOrgId(user),
      requesterId: user.id,
    });
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Patch('roles/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a role (name/color/permissions)' })
  async updateRole(@Param('id') roleId: string, @Body() body: UpdateOrgRoleDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(updateAccessRole, {
      ...body,
      roleId,
      organizationId: callerOrgId(user),
      requesterId: user.id,
    });
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Delete('roles/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Delete a custom role' })
  async deleteRole(@Param('id') roleId: string, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(deleteAccessRole, {
      roleId,
      organizationId: callerOrgId(user),
      requesterId: user.id,
    });
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }
}
