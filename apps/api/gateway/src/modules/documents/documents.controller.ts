import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserData } from '@hbcfield/shared';
import { DocumentsGatewayService } from './documents.service';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { documentActor, requestContext } from './documents.actor';
import {
  SetDocumentVisibilityDto,
  DeleteDocumentsDto,
  ConfirmUploadDto,
  ListDocumentsQueryDto,
  ListIssuedQueryDto,
  BrowseQueryDto,
  PresignUploadDto,
} from './dto/documents.dto';
import { OrgEventsService } from '../../common/events/org-events.service';

/**
 * The personnel file, over HTTP.
 *
 * Transport and authorization only — the service owns every rule. Two things
 * about the shape of this controller are deliberate:
 *
 * `@RequirePlan('documents')` sits on the class, and PlanGuard lets READS
 * through while returning 402 on mutations. So an organization that cancels the
 * add-on keeps access to documents it already has — which is the only defensible
 * behaviour when the documents in question are somebody's employment records.
 *
 * There is NO `@RequirePermission` on the routes a member uses about their own
 * file. Reading your own documents is not a permission and never will be; the
 * service decides self-versus-other from the authenticated id, not from a
 * parameter a caller can set.
 */
@ApiTags('documents')
@ApiBearerAuth()
@RequirePlan('documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsGatewayService,
    // A document type carries who may see it, so a change to one has to reach
    // every colleague's open register without them reloading.
    private readonly orgEvents: OrgEventsService,
  ) {}

  // ── Issuing ──────────────────────────────────────────────────────────────

  @Post('upload-url')
  @RequirePermission('canIssueDocuments')
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // a payroll batch, not a scraper
  @ApiOperation({ summary: 'Get a direct upload link' })
  async presignUpload(@CurrentUser() user: CurrentUserData, @Body() body: PresignUploadDto) {
    return this.documents.presignUpload({ actor: documentActor(user), ...body });
  }

  @Post()
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'File an uploaded document against a member' })
  async confirmUpload(
    @CurrentUser() user: CurrentUserData,
    @Body() body: ConfirmUploadDto,
    @Req() req: any,
  ) {
    const created = await this.documents.confirmUpload({
      actor: documentActor(user),
      ...body,
      ctx: requestContext(req),
    });
    // A replacement hides the old version from its member; let open screens know.
    if (body.replacesId) this.orgEvents.documentTypesChanged(user.organizationId, null);
    return created;
  }

  /*
    Control over existing documents. Bulk by design (1–100 ids) and POST with a
    body, because the web selects several rows at once. The service scopes every
    id by what the caller may see and refuses the whole request if one is out of
    scope, so the guard here is the first gate, not the only one.
  */
  @Post('bulk/visibility')
  @RequirePermission('canManageDocumentVisibility')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Choose who sees documents: hide from the member, or limit to roles' })
  async setVisibility(
    @CurrentUser() user: CurrentUserData,
    @Body() body: SetDocumentVisibilityDto,
    @Req() req: any,
  ) {
    const result = await this.documents.setVisibility({
      actor: documentActor(user),
      documentIds: body.documentIds,
      hiddenFromMember: body.hiddenFromMember,
      roleIds: body.roleIds,
      ctx: requestContext(req),
    });
    // Every open document screen in the organization re-reads — including the
    // member's own, so a hidden document leaves their phone without a refresh.
    this.orgEvents.documentTypesChanged(user.organizationId, null);
    return result;
  }

  @Post('bulk/delete')
  @RequirePermission('canDeleteDocuments')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Erase documents for good (signatures included); audit-logged' })
  async deleteDocuments(
    @CurrentUser() user: CurrentUserData,
    @Body() body: DeleteDocumentsDto,
    @Req() req: any,
  ) {
    const result = await this.documents.deleteDocuments({
      actor: documentActor(user),
      documentIds: body.documentIds,
      confirmSignaturesLost: body.confirmSignaturesLost === true,
      ctx: requestContext(req),
    });
    this.orgEvents.documentTypesChanged(user.organizationId, null);
    return result;
  }

  @Post(':id/revoke')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Withdraw a document (marks it revoked; never deletes)' })
  async revoke(@CurrentUser() user: CurrentUserData, @Param('id') id: string, @Req() req: any) {
    return this.documents.revoke({
      actor: documentActor(user),
      documentId: id,
      ctx: requestContext(req),
    });
  }

  /**
   * Take your whole file away.
   *
   * A POST because it records a read against every document in it — and
   * throttled hard: a legitimate person exports their file once, not hourly.
   */
  @Post('export')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Export every document in a member’s file' })
  async export(
    @CurrentUser() user: CurrentUserData,
    @Body() body: { userId?: string },
    @Req() req: any,
  ) {
    return this.documents.export({
      actor: documentActor(user),
      targetUserId: body?.userId,
      ctx: requestContext(req),
    });
  }

  @Get('browse')
  @RequirePermission('canViewMemberDocuments')
  @ApiOperation({ summary: 'Browse issued documents as folders' })
  async browse(@CurrentUser() user: CurrentUserData, @Query() query: BrowseQueryDto) {
    return this.documents.browse({
      actor: documentActor(user),
      groupBy: query.groupBy,
      typeId: query.typeId,
      userId: query.userId,
      year: query.year ? Number(query.year) : undefined,
      undated: query.undated === 'true',
    });
  }

  /*
    The register. Named `sent` for one reason: this path is live, and renaming it
    would 404 for every browser still running the previous bundle.

    The word is wrong and the screen it serves has been renamed — it holds every
    document in the organization, ISSUED and SUPPLIED, and half of it is a filing
    cabinet rather than an outbox. Nothing here was posted anywhere. Read the
    summary, not the path.
  */
  @Get('sent')
  @RequirePermission('canViewMemberDocuments')
  @ApiOperation({ summary: 'The register: every document in the organization — issued and supplied — by state' })
  async listIssued(@CurrentUser() user: CurrentUserData, @Query() query: ListIssuedQueryDto) {
    return this.documents.listIssued({
      actor: documentActor(user),
      tab: query.tab,
      typeId: query.typeId,
      userId: query.userId,
      year: query.year ? Number(query.year) : undefined,
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  // ── Reading ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List documents — your own, or a member’s if permitted' })
  async list(@CurrentUser() user: CurrentUserData, @Query() query: ListDocumentsQueryDto) {
    return this.documents.list({
      actor: documentActor(user),
      targetUserId: query.userId,
      typeId: query.typeId,
      year: query.year ? Number(query.year) : undefined,
      search: query.search,
    });
  }

  /**
   * Minting a link IS the "opened" event, which is why this is a POST and why
   * no list route returns a URL. A GET here would be prefetched by browsers and
   * link scanners, and the delivery evidence would record robots.
   */
  @Post(':id/download-url')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Mint a short-lived download link and record the open' })
  async downloadUrl(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.documents.downloadUrl({
      actor: documentActor(user),
      documentId: id,
      ctx: requestContext(req),
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a document you supplied yourself' })
  async deleteOwn(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.documents.deleteOwn({ actor: documentActor(user), documentId: id });
  }
}
