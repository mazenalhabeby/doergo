import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@hbcfield/shared';
import { DocumentsGatewayService } from './documents.service';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { documentActor } from './documents.actor';
import { CreateDocumentTypeDto, RouteCandidatesQueryDto, UpdateDocumentTypeDto } from './dto/documents.dto';
import { OrgEventsService } from '../../common/events/org-events.service';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';

/** /documents/types — the catalogue: types, who may see them, who may be routed to sign. */
@ApiTags('documents')
@ApiBearerAuth()
@RequirePlan('documents')
@Controller('documents')
export class DocumentTypesController {
  constructor(
    private readonly documents: DocumentsGatewayService,
    // A document type carries who may see it, so a change to one has to reach
    // every colleague's open register without them reloading.
    private readonly orgEvents: OrgEventsService,
  ) {}

  // ── Types ────────────────────────────────────────────────────────────────

  /**
   * The roles a document can be limited to — names only.
   *
   * Its own route because the full role list sits behind `canManageUsers`, and
   * whoever decides who reads a contract (HR) is usually not who manages
   * members. Returns id, name and colour: never what a role grants.
   */
  @Get('visibility-roles')
  @RequirePermission('canManageDocumentVisibility')
  @ApiOperation({ summary: 'Org roles a document can be limited to (id, name, colour)' })
  async visibilityRoles(@CurrentUser() user: SessionUser) {
    const res: any = await this.documents.listOrgRoles(user.organizationId ?? '');
    const list: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return list
      .filter((r) => r && r.isActive !== false)
      .map((r) => ({ id: r.id as string, name: r.name as string, color: (r.color as string) ?? null }));
  }

  @Get('types')
  @ApiOperation({ summary: 'Document types defined by this organization' })
  async listTypes(@CurrentUser() user: SessionUser, @Query('includeInactive') includeInactive?: string) {
    const actor = documentActor(user);
    return this.documents.listTypes({
      organizationId: callerOrgId(user),
      includeInactive: includeInactive === 'true',
      roleId: actor.roleId,
      isAdmin: actor.isAdmin,
      // Their own file is never restricted from them — see visibleTypeSelfWhere.
      userId: actor.userId,
      // Somebody configuring types has to see them all — see listTypes.
      manage: actor.canManageDocumentTemplates,
    });
  }

  @Post('types')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Define a document type' })
  async createType(@CurrentUser() user: SessionUser, @Body() body: CreateDocumentTypeDto) {
    const created = await this.documents.createType({ actor: documentActor(user), ...body });
    /*
      Everybody's register, without a refresh.

      A type carries who may SEE it, so defining or narrowing one changes what a
      colleague's list contains — and the person who made the change is rarely
      the person looking at the list.
    */
    this.orgEvents.documentTypesChanged(user.organizationId, (created as { id?: string })?.id ?? null);
    return created;
  }

  @Patch('types/:id')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Update a document type' })
  async updateType(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: UpdateDocumentTypeDto) {
    const updated = await this.documents.updateType({ actor: documentActor(user), id, patch: body });
    this.orgEvents.documentTypesChanged(user.organizationId, id);
    return updated;
  }

  @Delete('types/:id')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Retire a document type (never deletes filed documents)' })
  async deactivateType(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    const result = await this.documents.deactivateType({ actor: documentActor(user), id });
    this.orgEvents.documentTypesChanged(user.organizationId, id);
    return result;
  }

  // ── Credentials ──────────────────────────────────────────────────────────

  /*
    Deliberately gated on canAssignTasks, not on a document permission.

    A dispatcher needs to know WHY somebody dropped out of the assignable pool.
    This returns validity and dates — never the certificate itself, which stays
    behind canOpenMemberDocuments.
  */
  /**
   * The register: everything this organization has issued.
   *
   * On `canViewMemberDocuments`, which grants seeing THAT a document exists and
   * what state it is in. Opening one is checked separately when a link is
   * minted, so chasing a signature never becomes reading a payslip.
   */
  /**
   * One level of the filing cabinet.
   *
   * Same permission as the register: which folders exist and how full they are
   * is metadata. Opening any document inside one is still checked separately.
   */
  /**
   * Who could sign each step, for this member and this type.
   *
   * Asked BEFORE issuing so the screen can present a choice where there is one,
   * rather than the service picking somebody and the issuer finding out later.
   */
  @Get('route-candidates')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Possible signers for each step of a type’s route' })
  async routeCandidates(@CurrentUser() user: SessionUser, @Query() query: RouteCandidatesQueryDto) {
    return this.documents.routeCandidates({
      actor: documentActor(user),
      memberId: query.memberId,
      typeId: query.typeId,
    });
  }
}
