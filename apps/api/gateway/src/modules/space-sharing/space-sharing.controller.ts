import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Inject, HttpException, HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Cross-org space sharing. OWNER routes (`/locations/:spaceId/shares…`) require
 * canManageUsers and the auth-service re-asserts the space belongs to the caller's
 * org. GUEST routes (`/shared-spaces…`) scope everything to the caller's org id
 * server-side. No org id is ever taken from the client body.
 */
@ApiTags('space-sharing')
@Controller()
@ApiBearerAuth()
export class SpaceSharingController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: ClientProxy,
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
  ) {}

  private async send(cmd: string, payload: any) {
    const res = await firstValueFrom(this.auth.send({ cmd }, payload));
    if (res && res.success === false) {
      throw new HttpException({ message: res.message }, res.statusCode || HttpStatus.BAD_REQUEST);
    }
    return res;
  }

  /** Sharing a space is a paid module — the OWNER space must have it enabled. */
  private async requireModule(spaceId: string, organizationId: string | null | undefined) {
    if (!organizationId) throw new HttpException({ message: 'No organization' }, HttpStatus.FORBIDDEN);
    const res: any = await firstValueFrom(this.taskClient.send({ cmd: 'get_effective_modules' }, { id: spaceId, organizationId }));
    const mods: string[] = res?.data?.enabledModules ?? res?.enabledModules ?? [];
    if (!mods.includes('space_sharing')) {
      throw new HttpException({ message: 'Enable the Space Sharing module for this space first.' }, HttpStatus.FORBIDDEN);
    }
  }

  // ── OWNER ──────────────────────────────────────────────────────────────────
  @Post('locations/:spaceId/shares')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Share this space with another org (invite)' })
  async createShare(@Param('spaceId') spaceId: string, @Body() body: any, @CurrentUser() u: CurrentUserData) {
    await this.requireModule(spaceId, u.organizationId);
    return this.send('space_share_create', {
      ownerOrgId: u.organizationId, createdById: u.id, spaceId,
      guestOrgCode: body.guestOrgCode, level: body.level,
      showWorkers: body.showWorkers, showAttendance: body.showAttendance,
      showTracking: body.showTracking, showReports: body.showReports, allowRequests: body.allowRequests,
    });
  }

  @Get('locations/:spaceId/shares')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "List this space's cross-org shares" })
  listForSpace(@Param('spaceId') spaceId: string, @CurrentUser() u: CurrentUserData) {
    return this.send('space_share_list_for_space', { ownerOrgId: u.organizationId, spaceId });
  }

  @Patch('locations/:spaceId/shares/:shareId')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a share (level / visibility scope)' })
  updateShare(@Param('shareId') shareId: string, @Body() body: any, @CurrentUser() u: CurrentUserData) {
    // Whitelist mutable fields explicitly — never spread the untyped body, which
    // would let a malicious `ownerOrgId`/`shareId` override the tenant scope
    // (body is `any`, so ValidationPipe's whitelist doesn't apply). Mirrors createShare.
    return this.send('space_share_update', {
      ownerOrgId: u.organizationId,
      shareId,
      level: body.level,
      showWorkers: body.showWorkers,
      showAttendance: body.showAttendance,
      showTracking: body.showTracking,
      showReports: body.showReports,
      allowRequests: body.allowRequests,
    });
  }

  @Delete('locations/:spaceId/shares/:shareId')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Revoke a share' })
  revokeShare(@Param('shareId') shareId: string, @CurrentUser() u: CurrentUserData) {
    return this.send('space_share_revoke', { ownerOrgId: u.organizationId, shareId });
  }

  @Get('locations/:spaceId/share-requests')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "Guest requests against this space (owner view)" })
  listRequestsOwner(@Param('spaceId') spaceId: string, @Query('status') status: string, @CurrentUser() u: CurrentUserData) {
    return this.send('space_share_request_list', { ownerOrgId: u.organizationId, spaceId, status });
  }

  @Patch('share-requests/:requestId/resolve')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Approve/reject a guest request' })
  resolveRequest(@Param('requestId') requestId: string, @Body() body: { approve: boolean }, @CurrentUser() u: CurrentUserData) {
    return this.send('space_share_request_resolve', { ownerOrgId: u.organizationId, requestId, approve: !!body.approve, userId: u.id });
  }

  // ── GUEST ──────────────────────────────────────────────────────────────────
  @Get('shared-spaces')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Spaces shared WITH my org (pending invites + active)' })
  listIncoming(@CurrentUser() u: CurrentUserData) {
    return this.send('space_share_list_incoming', { guestOrgId: u.organizationId });
  }

  @Post('shared-spaces/:shareId/respond')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Accept or decline a share invite' })
  respond(@Param('shareId') shareId: string, @Body() body: { accept: boolean }, @CurrentUser() u: CurrentUserData) {
    return this.send('space_share_respond', { guestOrgId: u.organizationId, shareId, accept: !!body.accept, userId: u.id });
  }

  @Post('shared-spaces/:shareId/requests')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Request more tasks/workers on a shared space' })
  createRequest(@Param('shareId') shareId: string, @Body() body: any, @CurrentUser() u: CurrentUserData) {
    return this.send('space_share_request_create', {
      guestOrgId: u.organizationId, userId: u.id, shareId, type: body.type, title: body.title, note: body.note,
    });
  }

  @Get('shared-spaces/:spaceId/requests')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: "My org's requests on a shared space (guest view)" })
  listRequestsGuest(@Param('spaceId') spaceId: string, @Query('status') status: string, @CurrentUser() u: CurrentUserData) {
    return this.send('space_share_request_list', { guestOrgId: u.organizationId, spaceId, status });
  }
}
