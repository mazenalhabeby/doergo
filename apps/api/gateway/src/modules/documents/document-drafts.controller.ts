import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserData } from '@hbcfield/shared';
import { DocumentsGatewayService } from './documents.service';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { documentActor, requestContext } from './documents.actor';
import { PresignOwnUploadDto, ReadOwnUploadDto, SubmitOwnDocumentDto, PublishBatchDto } from './dto/documents.dto';
import { OrgEventsService } from '../../common/events/org-events.service';

/** /documents — a member supplying their own documents, and the office's batch drafts. */
@ApiTags('documents')
@ApiBearerAuth()
@RequirePlan('documents')
@Controller('documents')
export class DocumentDraftsController {
  constructor(
    private readonly documents: DocumentsGatewayService,
    // A document type carries who may see it, so a change to one has to reach
    // every colleague's open register without them reloading.
    private readonly orgEvents: OrgEventsService,
  ) {}

  // ── What the member supplies themselves ──────────────────────────────────
  //
  // NO @RequirePermission on either. Uploading your own driving licence is not
  // an administrative act — it is the only way an organization can hold a
  // document that only its holder possesses. The service checks the TYPE
  // instead: SUPPLIED only, so this can never become a way to file yourself a
  // payslip. Neither route takes a user id; the member is the token.

  @Post('mine/upload-url')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'A link to upload one of your own documents to' })
  async presignOwnUpload(@CurrentUser() user: CurrentUserData, @Body() body: PresignOwnUploadDto) {
    return this.documents.presignOwnUpload({ actor: documentActor(user), ...body });
  }

  @Post('mine/read')
  // OCR is real CPU work. A person scanning a document does one read per
  // attempt; this bound is for something that is not a person.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'What is on the document you just uploaded — files nothing' })
  async readOwnUpload(@CurrentUser() user: CurrentUserData, @Body() body: ReadOwnUploadDto) {
    return this.documents.readOwnUpload({ actor: documentActor(user), ...body });
  }

  @Post('mine')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'File your uploaded document for review' })
  async submitOwnDocument(@CurrentUser() user: CurrentUserData, @Body() body: SubmitOwnDocumentDto, @Req() req: any) {
    return this.documents.submitOwnDocument({
      actor: documentActor(user),
      ...body,
      ctx: requestContext(req),
    });
  }

  // ── Payroll day ──────────────────────────────────────────────────────────

  @Get('match-candidates')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Members a batch can be matched against' })
  async matchCandidates(@CurrentUser() user: CurrentUserData) {
    return this.documents.matchCandidates({ actor: documentActor(user) });
  }

  @Get('drafts')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Documents staged but not yet released' })
  async listDrafts(@CurrentUser() user: CurrentUserData) {
    return this.documents.listDrafts({ actor: documentActor(user) });
  }

  @Post('publish')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Release a staged batch — all or nothing' })
  async publishBatch(@CurrentUser() user: CurrentUserData, @Body() body: PublishBatchDto, @Req() req: any) {
    return this.documents.publishBatch({
      actor: documentActor(user),
      documentIds: body.documentIds,
      signerChoices: body.signerChoices,
      ctx: requestContext(req),
    });
  }

  @Delete('drafts/:id')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Throw away a staged document' })
  async discardDraft(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.documents.discardDraft({ actor: documentActor(user), documentId: id });
  }
}
