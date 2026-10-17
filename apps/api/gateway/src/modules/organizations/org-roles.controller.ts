import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { RebillService } from '../../common/billing/rebill.service';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { OrgEventsService } from '../../common/events/org-events.service';
import { CurrentUser, CurrentUserData, assertServiceOk } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { ChatReachLookup } from '../chat/chat-reach.lookup';

/** /organizations/roles — the organization's access roles. */
@ApiTags('organizations')
@UseInterceptors(LabourCostInterceptor)
@Controller('organizations')
@ApiBearerAuth()
export class OrgRolesController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly billing: RebillService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly orgEvents: OrgEventsService,
    private readonly authCache: AuthTokenCache,
    private readonly chatReach: ChatReachLookup,
  ) {}

  @Get('roles')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List assignable roles (org: Admin/Manager/custom · space: Space Manager/…)' })
  async listRoles(@CurrentUser() user: CurrentUserData, @Query('scope') scope?: string) {
    return firstValueFrom(
      this.authClient.send(
        { cmd: 'list_access_roles' },
        { organizationId: user.organizationId, scope: scope === 'space' ? 'space' : 'org' },
      ),
    );
  }

  @Post('roles')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a custom org-wide role' })
  async createRole(
    @Body() body: { name: string; description?: string; color?: string; permissions?: Record<string, boolean> },
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'create_access_role' }, { ...body, organizationId: user.organizationId, requesterId: user.id }),
    );
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Patch('roles/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a role (name/color/permissions)' })
  async updateRole(
    @Param('id') roleId: string,
    @Body() body: { name?: string; description?: string; color?: string; permissions?: Record<string, boolean> },
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_access_role' }, { ...body, roleId, organizationId: user.organizationId, requesterId: user.id }),
    );
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Delete('roles/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Delete a custom role' })
  async deleteRole(@Param('id') roleId: string, @CurrentUser() user: CurrentUserData) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'delete_access_role' }, { roleId, organizationId: user.organizationId, requesterId: user.id }),
    );
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }
}
