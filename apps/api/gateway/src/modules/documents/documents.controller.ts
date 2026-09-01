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
  CreateTemplateDto,
  PresignOwnUploadDto,
  ReadOwnUploadDto,
  RejectDocumentDto,
  PreviewTemplateDto,
  SubmitOwnDocumentDto,
  IssueFromTemplateDto,
  ListDocumentsQueryDto,
  ListIssuedQueryDto,
  BrowseQueryDto,
  RouteCandidatesQueryDto,
  SendBackDto,
  PresignUploadDto,
  PublishBatchDto,
  SignDocumentDto,
  UpdateDocumentTypeDto,
  UpdateTemplateDto,
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
  async routeCandidates(
    @CurrentUser() user: CurrentUserData,
    @Query() query: RouteCandidatesQueryDto,
  ) {
    return this.documents.routeCandidates({
      actor: documentActor(user),
      memberId: query.memberId,
      typeId: query.typeId,
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

  @Get('sent')
  @RequirePermission('canViewMemberDocuments')
  @ApiOperation({ summary: 'Every document the organization has issued, by state' })
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

  @Get('compliance')
  @RequirePermission('canAssignTasks')
  @ApiOperation({ summary: 'Credential validity across the organization' })
  async compliance(@CurrentUser() user: CurrentUserData) {
    return this.documents.compliance({ organizationId: user.organizationId });
  }

  /**
   * What you still owe the organization.
   *
   * No permission for your own — like the document list itself, it is your
   * data. `userId` reads somebody else's and needs the grant that lets you see
   * their documents exist at all.
   */
  @Get('requirements')
  @ApiOperation({ summary: 'Documents the organization expects from a member' })
  async requirements(@CurrentUser() user: CurrentUserData, @Query('userId') userId?: string) {
    return this.documents.requirements({ actor: documentActor(user), targetUserId: userId });
  }

  /**
   * Everything personally outstanding, for a badge.
   *
   * Deliberately separate from `requirements`, and deliberately without a
   * `userId`. It answers "what is left for ME", which is the only question a
   * reminder should be able to ask — a summary endpoint that accepts somebody
   * else's id is a convenient way to find out who is behind on what.
   */
  @Get('pending')
  @ApiOperation({ summary: 'What the signed-in member still has to upload or sign' })
  async pending(@CurrentUser() user: CurrentUserData) {
    return this.documents.pending({ actor: documentActor(user) });
  }

  // ── Reviewing what members supplied ──────────────────────────────────────
  //
  // On `canIssueDocuments`, not a fifth permission key. Deciding that a
  // certificate is genuine and filing it into somebody's record is the same
  // authority as filing one yourself — and a permission nobody remembers to
  // grant means a review queue that silently fills up.

  @Get('awaiting-verification')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Documents members have supplied, waiting to be checked' })
  async awaitingVerification(@CurrentUser() user: CurrentUserData) {
    return this.documents.awaitingVerification({ actor: documentActor(user) });
  }

  @Post(':id/verify')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Accept it — from here it counts' })
  async verifyDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.documents.verifyDocument({
      actor: documentActor(user),
      documentId: id,
      ctx: requestContext(req),
    });
  }

  @Post(':id/reject')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Refuse it, with a reason the member reads' })
  async rejectDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: RejectDocumentDto,
    @Req() req: any,
  ) {
    return this.documents.rejectDocument({
      actor: documentActor(user),
      documentId: id,
      reason: body.reason,
      ctx: requestContext(req),
    });
  }

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
  async submitOwnDocument(
    @CurrentUser() user: CurrentUserData,
    @Body() body: SubmitOwnDocumentDto,
    @Req() req: any,
  ) {
    return this.documents.submitOwnDocument({
      actor: documentActor(user),
      ...body,
      ctx: requestContext(req),
    });
  }

  // ── Templates ────────────────────────────────────────────────────────────

  @Get('templates')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Contract templates' })
  async listTemplates(
    @CurrentUser() user: CurrentUserData,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.documents.listTemplates({
      actor: documentActor(user),
      includeInactive: includeInactive === 'true',
    });
  }

  @Post('templates')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Create a contract template' })
  async createTemplate(@CurrentUser() user: CurrentUserData, @Body() body: CreateTemplateDto) {
    return this.documents.createTemplate({ actor: documentActor(user), ...body });
  }

  @Post('templates/preview')
  @RequirePermission('canManageDocumentTemplates')
  // Rendering a PDF is real work, and the editor asks on demand rather than on
  // every keystroke — a person clicking Preview does not reach this rate.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Lay a draft out as the PDF a member would receive — stores nothing' })
  async previewTemplate(@CurrentUser() user: CurrentUserData, @Body() body: PreviewTemplateDto) {
    return this.documents.previewTemplate({ actor: documentActor(user), ...body });
  }

  @Patch('templates/:id')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Edit a template (bumps its version; issued documents are untouched)' })
  async updateTemplate(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: UpdateTemplateDto,
  ) {
    return this.documents.updateTemplate({ actor: documentActor(user), id, patch: body });
  }

  @Delete('templates/:id')
  @RequirePermission('canManageDocumentTemplates')
  @ApiOperation({ summary: 'Retire a template' })
  async deactivateTemplate(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.documents.deactivateTemplate({ actor: documentActor(user), id });
  }

  @Post('issue-contract')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Render and issue a contract to one member' })
  async issueContract(
    @CurrentUser() user: CurrentUserData,
    @Body() body: IssueFromTemplateDto,
    @Req() req: any,
  ) {
    return this.documents.issueFromTemplate({
      actor: documentActor(user),
      userId: body.userId,
      templateId: body.templateId,
      contract: { startDate: body.startDate, weeklyHours: body.weeklyHours },
      ctx: requestContext(req),
    });
  }

  // ── Signing ──────────────────────────────────────────────────────────────
  /*
    No @RequirePermission on any of these. You sign YOUR OWN document, and the
    service scopes every lookup to the authenticated user — there is deliberately
    no permission anywhere that could grant signing on somebody else's behalf,
    because that is the one thing a signature cannot survive.
  */

  /**
   * Return a document to an earlier signer, with a reason.
   *
   * Deliberately no @RequirePermission: the right to send back comes from being
   * the person currently waited on, which the service verifies. A permission
   * here would let somebody outside the chain reach into it.
   */
  @Post(':id/send-back')
  @ApiOperation({ summary: 'Send a document back to an earlier signer' })
  async sendBack(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: SendBackDto,
    @Req() req: any,
  ) {
    return this.documents.sendBack({
      actor: documentActor(user),
      documentId: id,
      reason: body.reason,
      ctx: requestContext(req),
    });
  }

  @Post(':id/consent')
  @ApiOperation({ summary: 'Record agreement to sign electronically' })
  async consent(@CurrentUser() user: CurrentUserData, @Param('id') id: string, @Req() req: any) {
    return this.documents.consent({
      actor: documentActor(user),
      documentId: id,
      ctx: requestContext(req),
    });
  }

  @Post(':id/sign')
  // Tighter than the rest: signing is expensive, and a legitimate person signs
  // a handful of documents, not a hundred a minute.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Sign, seal and freeze a document' })
  async sign(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: SignDocumentDto,
    @Req() req: any,
  ) {
    return this.documents.sign({
      actor: documentActor(user),
      documentId: id,
      signatureImage: body.signatureImage,
      idempotencyKey: body.idempotencyKey,
      // Read from the verified token, never from the body — a client that could
      // state when it authenticated could state anything.
      sessionAuthenticatedAt: req.user?.iat ? new Date(req.user.iat * 1000).toISOString() : null,
      ctx: requestContext(req),
    });
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Record "I have read this" — receipt, not agreement' })
  async acknowledge(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.documents.acknowledge({
      actor: documentActor(user),
      documentId: id,
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
  async publishBatch(
    @CurrentUser() user: CurrentUserData,
    @Body() body: PublishBatchDto,
    @Req() req: any,
  ) {
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

  /**
   * Who has signed this, and who is next.
   *
   * No permission decorator: the service allows anyone in the chain, the
   * document's own member, or anyone who may see member documents. A signer has
   * to be able to see what is above their name.
   */
  @Get(':id/chain')
  @ApiOperation({ summary: 'The signing chain on one document' })
  async documentChain(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.documents.documentChain({ actor: documentActor(user), documentId: id });
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
