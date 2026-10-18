import { Controller, Get, Post, Body, Param, Query, Inject, HttpStatus, UseInterceptors } from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { CurrentUser, assertServiceOk } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { ListMembersQueryDto, TransferOwnershipDto } from './dto';
import { ChatReachLookup } from '../chat/chat-reach.lookup';
import {
  sendRpc,
  listOrgMembers,
  memberStatement,
  getOrgMember,
  listOrgContacts,
  transferOwnership,
} from '@hbcfield/shared/microservices';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';

/**
 * /organizations/members — the list, one member, a worker's statement, contacts,
 * handing over ownership.
 */
@ApiTags('organizations')
@UseInterceptors(LabourCostInterceptor)
@Controller('organizations')
@ApiBearerAuth()
export class OrgMembersController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly chatReach: ChatReachLookup,
  ) {}

  // ============================================================================
  // MEMBERS
  // ============================================================================

  @Get('members')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List organization members' })
  @ApiResponse({ status: 200, description: 'Members list' })
  async listMembers(@Query() query: ListMembersQueryDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, listOrgMembers, {
        organizationId: callerOrgId(user),
        search: query.search,
        role: query.role,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
        // Leadership pickers: let the database pick the admins and managers
        // rather than shipping the whole staff list for the browser to filter.
        managersOnly: query.managersOnly === true || (query.managersOnly as unknown) === 'true',
        excludeId: query.excludeId,
        lite: query.lite === true || (query.lite as unknown) === 'true',
        includeIds: query.includeIds
          ? String(query.includeIds)
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
              .slice(0, 200)
          : undefined,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    return result;
  }

  /**
   * A worker's statement: their hours, per workspace, at THEIR rate with us —
   * never the client's. Same jobs and hours as the client invoice.
   *
   * ⚠️ `canViewLabourCost`, not `canManageUsers`: the whole document is what a
   * person's hours cost the company. (Org-wide user managers hold it through
   * the existing bridge.) Read-only; nothing is stored.
   */
  @Get('members/:id/statement')
  @RequirePermission('canViewLabourCost')
  @ApiOperation({ summary: "A worker's statement: hours × their rate with us, for a period" })
  async memberStatement(
    @Param('id') memberId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, memberStatement, {
        memberId,
        organizationId: callerOrgId(user),
        from: typeof from === 'string' ? from.slice(0, 10) : undefined,
        to: typeof to === 'string' ? to.slice(0, 10) : undefined,
      }),
    );
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Get('members/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Get a single organization member (same shape as the list row)' })
  async getMember(@Param('id') memberId: string, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, getOrgMember, {
        memberId,
        organizationId: user.organizationId,
      }),
    );
    assertServiceOk(result, HttpStatus.NOT_FOUND);
    return result;
  }

  @Get('contacts')
  @ApiOperation({ summary: 'List the org admins/managers to contact — any org member' })
  @ApiResponse({ status: 200, description: 'Contacts list' })
  async listContacts(@CurrentUser() user: SessionUser) {
    const contacts = await firstValueFrom(
      sendRpc(this.authClient, listOrgContacts, {
        organizationId: user.organizationId,
        userId: user.id,
      }),
    );
    // Message buttons follow chat's own rule, not this list's.
    return this.chatReach.annotate(contacts, user);
  }

  /**
   * Hand the organization to another member.
   *
   * Guarded by the SERVICE on ownership, not by a permission here: only the
   * current owner may transfer, and no permission grants that. An admin who
   * could take ownership could then remove the founder, which is the exact
   * outcome the protection exists to prevent.
   */
  @Post('transfer-ownership')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Transfer organization ownership to another member' })
  async transferOwnership(@Body() dto: TransferOwnershipDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, transferOwnership, {
        organizationId: user.organizationId,
        requesterId: user.id,
        newOwnerId: dto.newOwnerId,
      }),
    );
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }
}
