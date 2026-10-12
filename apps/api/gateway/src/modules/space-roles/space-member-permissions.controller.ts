import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Put, Request, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SPACE_PERMISSION_KEYS, whitelistPermissions } from '@hbcfield/shared';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { RebillService } from '../../common/billing/rebill.service';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { SpaceRolesService } from './space-roles.service';
import { SetMemberPermissionsDto } from './space-roles.dto';
import { grantCeiling, managesMembersOrgWide, spaceMemberAuthority } from './space-member-access';

const SPACE_KEYS = new Set<string>(SPACE_PERMISSION_KEYS);

/**
 * THE PERMISSION BUILDER — what one person may do in one workspace
 * (docs/plans/external-role-builder.md).
 *
 * Its own controller, deliberately WITHOUT the `shift_scheduling` Option the
 * member routes sit behind: deciding what an outside supervisor may see is not
 * a rota feature, and an organization that never bought rotas must still be
 * able to say "this person only watches".
 *
 * The gate is giving roles HERE (`canGrantSpaceRoles` in the route's space, or
 * managing this space's people, or org-wide workspaces / admin). The rules on
 * WHAT may be given — space keys only, the external allow-list, the caller's
 * own ceiling, never their own row, never somebody above them, never another
 * person's personal role — live once in the shared writer
 * (`setAssignmentPermissions`), which the invitation accept path runs too.
 *
 * An assignment of another workspace reads as 404 (the service narrows to the
 * space in the path), so a grant held in space A can never reach space B.
 */
@ApiTags('space-roles')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('spaces/:spaceId/members/:assignmentId/permissions')
export class SpaceMemberPermissionsController {
  constructor(
    private readonly service: SpaceRolesService,
    private readonly billing: RebillService,
    private readonly authCache: AuthTokenCache,
  ) {}

  private assertMayGrantHere(user: any, spaceId: string) {
    if (!spaceMemberAuthority(user, spaceId).grantRoles) {
      throw new ForbiddenException('You cannot give roles in this workspace');
    }
  }

  @Get()
  @ApiOperation({ summary: "One person's permissions in this workspace, as the builder shows them" })
  get(@Param('spaceId') spaceId: string, @Param('assignmentId') assignmentId: string, @Request() req: any) {
    this.assertMayGrantHere(req.user, spaceId);
    return this.service.getMemberPermissions({
      organizationId: req.user.organizationId,
      spaceId,
      assignmentId,
      requesterPerms: grantCeiling(req.user, spaceId),
    });
  }

  @Put()
  @ApiOperation({ summary: "Set one person's permissions in this workspace: a shared role, or a set of keys" })
  async set(
    @Param('spaceId') spaceId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: SetMemberPermissionsDto,
    @Request() req: any,
  ) {
    this.assertMayGrantHere(req.user, spaceId);
    const hasRole = typeof body.roleId === 'string' && body.roleId.length > 0;
    const hasKeys = body.permissions !== undefined && body.permissions !== null;
    if (hasRole === hasKeys) {
      throw new BadRequestException({ message: 'Send either a role or a set of permissions', code: 'PERMISSIONS_CHOICE_INVALID' });
    }
    if (hasKeys) {
      /*
        Refused as a whole, never filtered. A key that means nothing in a
        workspace (an organization key, a typo) would otherwise be dropped by the
        whitelist and the save would read as done — the person then lacks what
        the screen said they were given.
      */
      const entries = Object.entries(body.permissions as Record<string, unknown>);
      const notBoolean = entries.filter(([, v]) => typeof v !== 'boolean').map(([k]) => k);
      const notHere = entries.filter(([k, v]) => v === true && !SPACE_KEYS.has(k)).map(([k]) => k);
      if (notBoolean.length || notHere.length) {
        throw new BadRequestException({
          message: 'These permissions cannot be given in a workspace',
          code: 'PERMISSION_KEY_NOT_IN_SPACE',
          params: { keys: [...notBoolean, ...notHere] },
        });
      }
    }
    const result = await this.service.setMemberPermissions({
      organizationId: req.user.organizationId,
      spaceId,
      assignmentId,
      choice: hasRole ? { roleId: body.roleId as string } : { permissions: whitelistPermissions(body.permissions, 'space') },
      requesterPerms: grantCeiling(req.user, spaceId),
      requesterId: req.user.id,
      outrankCheck: !managesMembersOrgWide(req.user),
    });
    // An external member's seat is priced from what they hold: €2 watching, €9.99 anything more.
    this.billing.rebill(req.user.organizationId);
    // Their next request carries the new permissions — not the cached session's, for up to a minute.
    const userId = (result as any)?.data?.userId;
    if (typeof userId === 'string') await this.authCache.invalidateUser(userId);
    return result;
  }
}
