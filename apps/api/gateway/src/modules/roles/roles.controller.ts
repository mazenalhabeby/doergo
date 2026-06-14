import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { CreateRoleDto, UpdateRoleDto, UpdateRolePermissionsDto } from './dto';

@ApiTags('roles')
@Controller('roles')
@ApiBearerAuth()
export class RolesController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  @Get()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List organization roles' })
  @ApiResponse({ status: 200, description: 'Roles list' })
  async list(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'roles_find_all' }, {
        organizationId: user.organizationId,
      }),
    );
  }

  @Get(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Get role detail' })
  @ApiResponse({ status: 200, description: 'Role detail' })
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'roles_find_one' }, {
        id,
        organizationId: user.organizationId,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Post()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a custom role' })
  @ApiResponse({ status: 201, description: 'Role created' })
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'roles_create' }, {
        organizationId: user.organizationId,
        name: dto.name,
        description: dto.description,
        color: dto.color,
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

  @Patch(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update role name/description/color' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'roles_update' }, {
        id,
        organizationId: user.organizationId,
        name: dto.name,
        description: dto.description,
        color: dto.color,
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

  @Patch(':id/permissions')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update role permissions (syncs all users)' })
  @ApiResponse({ status: 200, description: 'Permissions updated' })
  async updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'roles_update_permissions' }, {
        id,
        organizationId: user.organizationId,
        permissions: dto.permissions,
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

  @Delete(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Delete a custom role (reassigns users to Employee)' })
  @ApiResponse({ status: 200, description: 'Role deleted' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'roles_delete' }, {
        id,
        organizationId: user.organizationId,
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
