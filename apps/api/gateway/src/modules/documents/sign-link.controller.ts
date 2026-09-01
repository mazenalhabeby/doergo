import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { DocumentsGatewayService } from './documents.service';
import { requestContext } from './documents.actor';

/**
 * The client's way in — a token from an email, and nothing else.
 *
 * Its own controller rather than a few more routes on the documents one,
 * because everything about it differs: no bearer token, no plan gate, no
 * permission, no organisation on the request. Sharing a class with the
 * authenticated routes would mean every decorator there had to be understood as
 * "except for these four", which is how a public route quietly inherits a guard
 * that assumes a user.
 *
 * ⚠ EVERY ROUTE IS A POST, INCLUDING THE READS.
 *
 * That is not REST pedantry, it is the whole reason the token is safe here. The
 * gateway logs `${method} ${url}` for every request (main.ts) and the exception
 * filter logs and RETURNS the url on every error — so a token in a path segment
 * would be written to stdout on each read and echoed back inside error bodies.
 * In the body it is masked by the existing redaction list. The web page keeps
 * it in a query string, which never reaches this service at all.
 */
@ApiTags('documents')
@Controller('documents/sign')
export class SignLinkController {
  constructor(private readonly documents: DocumentsGatewayService) {}

  /**
   * Everything waiting for this client, and everything they have signed.
   *
   * Answers a refusal rather than an error for a token that does not work:
   * "expired" earns the offer of a new link and "unknown" must say nothing at
   * all, and an exception could not carry that difference without also carrying
   * it into the logs.
   */
  @Public()
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: "A client's documents, by emailed token (public)" })
  open(@Body() body: { token: string }) {
    return this.documents.linkOpen({ token: body?.token ?? '' });
  }

  /** A short-lived URL for one document, and a record that they opened it. */
  @Public()
  @Post('file')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Open one document from a signing link (public)' })
  file(@Body() body: { token: string; signerId: string }) {
    return this.documents.linkFile({ token: body?.token ?? '', signerId: body?.signerId });
  }

  /**
   * Sign everything selected, in one ceremony.
   *
   * The request context is attached HERE from the connection — ip, user agent —
   * rather than being accepted from the body. It is the only provenance a link
   * signature has, and provenance a caller can set is not provenance.
   */
  @Public()
  @Post('submit')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Sign one or more documents from a signing link (public)' })
  submit(
    @Body()
    body: {
      token: string;
      signerIds: string[];
      signatureImage: string;
      name: string;
      role?: string | null;
      idempotencyKey: string;
    },
    @Req() req: any,
  ) {
    return this.documents.linkSign({
      token: body?.token ?? '',
      signerIds: body?.signerIds ?? [],
      signatureImage: body?.signatureImage,
      name: body?.name,
      role: body?.role ?? null,
      idempotencyKey: body?.idempotencyKey,
      ctx: requestContext(req),
    });
  }

  /**
   * "Send me a new link."
   *
   * The one part of this a stranger can reach, and the only part that could be
   * used to learn something — so it is built to give nothing away. The address
   * is used to FIND a client, never to decide where mail goes; the link is
   * always sent to the address already on file. The response is identical
   * whether or not anything was found, and the throttle is the tightest here
   * because this is the endpoint that costs somebody else an email.
   */
  @Public()
  @Post('resend')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Ask for a fresh signing link by email (public)' })
  resend(@Body() body: { email: string }) {
    return this.documents.linkReissue({ email: body?.email ?? '' });
  }
}
