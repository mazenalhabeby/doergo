import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@hbcfield/shared';
import { DocumentsGatewayService } from './documents.service';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { documentActor, requestContext } from './documents.actor';
import { CreateTemplateDto, PreviewTemplateDto, IssueFromTemplateDto, UpdateTemplateDto } from './dto/documents.dto';

import type { AuthedRequest } from '../../common/request.types';
import type { SessionUser } from '../../common/request.types';
/** /documents/templates — contract templates, and issuing a contract from one. */
@ApiTags('documents')
@ApiBearerAuth()
@RequirePlan('documents')
@Controller('documents')
export class DocumentTemplatesController {
  constructor(
    private readonly documents: DocumentsGatewayService,
  ) {}

  // ── Templates ────────────────────────────────────────────────────────────

  @Get('templates')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Contract templates' })
  async listTemplates(@CurrentUser() user: SessionUser, @Query('includeInactive') includeInactive?: string) {
    return this.documents.listTemplates({
      actor: documentActor(user),
      includeInactive: includeInactive === 'true',
    });
  }

  @Post('templates')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Create a contract template' })
  async createTemplate(@CurrentUser() user: SessionUser, @Body() body: CreateTemplateDto) {
    return this.documents.createTemplate({ actor: documentActor(user), ...body });
  }

  @Post('templates/preview')
  @RequirePermission('canManageDocumentTemplates')
  // Rendering a PDF is real work, and the editor asks on demand rather than on
  // every keystroke — a person clicking Preview does not reach this rate.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Lay a draft out as the PDF a member would receive — stores nothing' })
  async previewTemplate(@CurrentUser() user: SessionUser, @Body() body: PreviewTemplateDto) {
    return this.documents.previewTemplate({ actor: documentActor(user), ...body });
  }

  @Patch('templates/:id')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Edit a template (bumps its version; issued documents are untouched)' })
  async updateTemplate(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: UpdateTemplateDto) {
    return this.documents.updateTemplate({ actor: documentActor(user), id, patch: body });
  }

  @Delete('templates/:id')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Retire a template' })
  async deactivateTemplate(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.documents.deactivateTemplate({ actor: documentActor(user), id });
  }

  @Post('issue-contract')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Render and issue a contract to one member' })
  async issueContract(@CurrentUser() user: SessionUser, @Body() body: IssueFromTemplateDto, @Req() req: AuthedRequest) {
    return this.documents.issueFromTemplate({
      actor: documentActor(user),
      userId: body.userId,
      templateId: body.templateId,
      contract: {
        startDate: body.startDate,
        weeklyHours: body.weeklyHours,
        endDate: body.endDate,
        siteName: body.siteName,
        siteAddress: body.siteAddress,
        rotation: body.rotation,
      },
      ctx: requestContext(req),
    });
  }
}
