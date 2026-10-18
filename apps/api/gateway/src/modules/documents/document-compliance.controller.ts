import { scopeIdsFor } from '../../common/permission-scope';
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserData } from '@hbcfield/shared';
import { DocumentsGatewayService } from './documents.service';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { documentActor, requestContext } from './documents.actor';
import { RejectDocumentDto } from './dto/documents.dto';
import { OrgEventsService } from '../../common/events/org-events.service';
import { callerOrgId } from '../../common/caller-org';

import type { AuthedRequest } from '../../common/request.types';
import type { SessionUser } from '../../common/request.types';
import { VerifyDocumentDto } from './dto/link-bodies.dto';
/** /documents — the credential board, what is required and pending, and the verification queue. */
@ApiTags('documents')
@ApiBearerAuth()
@RequirePlan('documents')
@Controller('documents')
export class DocumentComplianceController {
  constructor(
    private readonly documents: DocumentsGatewayService,
    // A document type carries who may see it, so a change to one has to reach
    // every colleague's open register without them reloading.
    private readonly orgEvents: OrgEventsService,
  ) {}

  @Get('compliance')
  // Space-aware, because assignment is: the board answers "why can this person
  // not take the job", and that question now gets asked by someone who staffs
  // one site. The service narrows the answer to the people they staff.
  @RequirePermissionInSpace('canAssignTasks')
  // ⚠️ Closed to external members. The board names each person's credentials
  // and when they expire — the personnel file, which an external member never
  // reads however much of the site they run. Assigning work there does not
  // need it: the assignment itself refuses somebody blocked by a document.
  @DenyExternal()
  @ApiOperation({ summary: 'Credential validity for the people the caller assigns work to' })
  async compliance(@CurrentUser() user: SessionUser) {
    return this.documents.compliance({
      // Who is asking, so a type restricted to certain roles shows on the board
      // for exactly the people who may see it (and for administrators) — the
      // board used to be read as nobody, which shows unrestricted types only.
      actor: documentActor(user),
      organizationId: callerOrgId(user),
      scopeSpaceIds: scopeIdsFor(user, 'canAssignTasks'),
    });
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
  async requirements(@CurrentUser() user: SessionUser, @Query('userId') userId?: string) {
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
  async pending(@CurrentUser() user: SessionUser) {
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
  async awaitingVerification(@CurrentUser() user: SessionUser) {
    return this.documents.awaitingVerification({ actor: documentActor(user) });
  }

  @Post(':id/verify')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Accept it — from here it counts' })
  async verifyDocument(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    /*
      The expiry is settled at approval when the member's upload could not be
      read. The reviewer has the image in front of them; the member, standing
      somewhere with a phone, did not.
    */
    @Body() body: VerifyDocumentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.documents.verifyDocument({
      actor: documentActor(user),
      documentId: id,
      expiresOn: body?.expiresOn ?? null,
      ctx: requestContext(req),
    });
  }

  @Post(':id/reject')
  @RequirePermission('canIssueDocuments')
  @ApiOperation({ summary: 'Refuse it, with a reason the member reads' })
  async rejectDocument(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: RejectDocumentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.documents.rejectDocument({
      actor: documentActor(user),
      documentId: id,
      reason: body.reason,
      ctx: requestContext(req),
    });
  }
}
