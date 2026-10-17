import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserData } from '@hbcfield/shared';
import { DocumentsGatewayService } from './documents.service';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { documentActor, requestContext } from './documents.actor';
import { SendBackDto, SignDocumentDto } from './dto/documents.dto';
import { OrgEventsService } from '../../common/events/org-events.service';

import type { AuthedRequest } from '../../common/request.types';
import type { SessionUser } from '../../common/request.types';
/**
 * /documents/:id — the signing chain: send back, consent, sign, acknowledge, the
 * chain and its evidence.
 */
@ApiTags('documents')
@ApiBearerAuth()
@RequirePlan('documents')
@Controller('documents')
export class DocumentSigningController {
  constructor(
    private readonly documents: DocumentsGatewayService,
    // A document type carries who may see it, so a change to one has to reach
    // every colleague's open register without them reloading.
    private readonly orgEvents: OrgEventsService,
  ) {}

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
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: SendBackDto,
    @Req() req: AuthedRequest,
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
  async consent(@CurrentUser() user: SessionUser, @Param('id') id: string, @Req() req: AuthedRequest) {
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
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: SignDocumentDto,
    @Req() req: AuthedRequest,
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
  async acknowledge(@CurrentUser() user: SessionUser, @Param('id') id: string, @Req() req: AuthedRequest) {
    return this.documents.acknowledge({
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
  async documentChain(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.documents.documentChain({ actor: documentActor(user), documentId: id });
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'The evidence trail for one document' })
  async events(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.documents.events({ actor: documentActor(user), documentId: id });
  }
}
