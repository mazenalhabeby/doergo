import { Controller, Get, Param, Query, Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import { trackingVisibility } from '../../common/tracking-visibility';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, SERVICE_NAMES, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { sendRpc, getWorkers, findUser, getWorkerTasks } from '@hbcfield/shared/microservices';
import { getTechnicianAssignments } from '@hbcfield/shared/microservices';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';

/**
 * /users — other people: the workers list, one person, their tasks, their
 * workspace assignments. ⚠️ Registered AFTER UsersController, whose `me` routes
 * must come before `:id`.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserDirectoryController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

  @Get('workers')
  @ApiOperation({ summary: 'Get all employees (ADMIN or MANAGER)' })
  @ApiQuery({ name: 'organizationId', required: false })
  @RequirePermission('canViewAllTasks')
  async getWorkers(@CurrentUser() user: SessionUser, @Query() query: Record<string, any>) {
    // Office can only see workers in their organization
    return firstValueFrom(
      sendRpc(this.authClient, getWorkers, {
        ...query,
        organizationId: callerOrgId(user),
        /*
          Coordinates travel only to somebody who may see where people are.
          This list is the whole organization (the route asks "view all tasks"
          org-wide), so the org-wide answer is the one that applies. After the
          query spread, so a query parameter can never switch it on.
        */
        canViewTracking: trackingVisibility(user).canViewTracking,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    // Users can access their own data; admins and members granted "view all
    // tasks" can access other users (scoped to their org below).
    const privileged = user.role === Role.ADMIN || !!user.canViewAllTasks;
    if (user.id !== id && !privileged) {
      throw new ForbiddenException('You can only access your own profile');
    }

    const result = await firstValueFrom(sendRpc(this.authClient, findUser, { id, organizationId: callerOrgId(user) }));

    if (!result?.data) {
      throw new NotFoundException('User not found');
    }

    // Tenant isolation (S1): EVERY accessor — including an org ADMIN — is limited
    // to their own organization. An org owner is not a platform superadmin, so
    // there is no legitimate cross-tenant read. (find_user is also org-scoped now.)
    if (result.data.organizationId !== user.organizationId) {
      throw new ForbiddenException('You can only access users in your organization');
    }

    return result;
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get tasks assigned to an employee' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getWorkerTasks(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    // Plain workers see only their own tasks; admins and "view all tasks" members
    // can see any worker's tasks (scoped to their org).
    const privileged = user.role === Role.ADMIN || !!user.canViewAllTasks;
    if (!privileged && user.id !== id) {
      throw new ForbiddenException('You can only access your own tasks');
    }

    if (privileged && user.id !== id) {
      const workerResult = await firstValueFrom(
        sendRpc(this.authClient, findUser, { id, organizationId: callerOrgId(user) }),
      );

      if (!workerResult?.data) {
        throw new NotFoundException('Worker not found');
      }

      if (workerResult.data.organizationId !== user.organizationId) {
        throw new ForbiddenException('You can only access workers in your organization');
      }
    }

    return firstValueFrom(
      sendRpc(this.authClient, getWorkerTasks, { workerId: id, organizationId: callerOrgId(user) }),
    );
  }

  @Get(':id/assignments')
  @ApiOperation({ summary: 'Get company location assignments for a user' })
  @RequirePermission('canViewAllTasks')
  async getUserAssignments(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    // Verify user is in the same organization
    const targetUser = await firstValueFrom(
      sendRpc(this.authClient, findUser, { id, organizationId: callerOrgId(user) }),
    );

    if (!targetUser?.data) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.data.organizationId !== user.organizationId) {
      throw new ForbiddenException('You can only access users in your organization');
    }

    return firstValueFrom(
      sendRpc(this.taskClient, getTechnicianAssignments, { userId: id, organizationId: callerOrgId(user) }),
    );
  }
}
