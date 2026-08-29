import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserData } from '@hbcfield/shared';
import { DocumentsGatewayService } from './documents.service';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { documentActor, requestContext } from './documents.actor';
import {
  ConfirmUploadDto,
  CreateDocumentTypeDto,
  ListDocumentsQueryDto,
  PresignUploadDto,
  UpdateDocumentTypeDto,
} from './dto/documents.dto';

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
  constructor(private readonly documents: DocumentsGatewayService) {}

  // ── Types ────────────────────────────────────────────────────────────────

  @Get('types')
  @ApiOperation({ summary: 'Document types defined by this organization' })
  async listTypes(
    @CurrentUser() user: CurrentUserData,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.documents.listTypes({
      organizationId: user.organizationId,
      includeInactive: includeInactive === 'true',
    });
  }

  @Post('types')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Define a document type' })
  async createType(@CurrentUser() user: CurrentUserData, @Body() body: CreateDocumentTypeDto) {
    return this.documents.createType({ actor: documentActor(user), ...body });
  }

  @Patch('types/:id')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Update a document type' })
  async updateType(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: UpdateDocumentTypeDto,
  ) {
    return this.documents.updateType({ actor: documentActor(user), id, patch: body });
  }

  @Delete('types/:id')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Retire a document type (never deletes filed documents)' })
  async deactivateType(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.documents.deactivateType({ actor: documentActor(user), id });
  }

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
    return this.documents.confirmUpload({
      actor: documentActor(user),
      ...body,
      ctx: requestContext(req),
    });
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

  @Get(':id/events')
  @ApiOperation({ summary: 'The evidence trail for one document' })
  async events(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.documents.events({ actor: documentActor(user), documentId: id });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a document you supplied yourself' })
  async deleteOwn(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.documents.deleteOwn({ actor: documentActor(user), documentId: id });
  }
}
