import { type Logger } from '@nestjs/common';
import { clientEmailLocale, DEFAULT_LOCALE, type SupportedLocale, type PrismaService } from '@hbcfield/shared';

/**
 * The language a CLIENT's invitation is written in — the client rule
 * (`clientEmailLocales`): their own account, the client record, the
 * organization, English.
 *
 * Decided HERE and sent with the event, because this is the service that can
 * read the client record, and because notification-service's fallback for an
 * address — the inviting member's language — is the wrong one for a client:
 * the member who pressed "invite" writing German says nothing about what the
 * client reads. A failed lookup is English, never "let the inviter decide".
 */
export async function clientInviteLocale(
  prisma: PrismaService,
  logger: Logger,
  organizationId: string,
  email: string,
  customerId: string | null | undefined,
): Promise<SupportedLocale> {
  try {
    return await clientEmailLocale(prisma, organizationId, { email, customerId });
  } catch (e) {
    logger.warn(`Could not look up a language for a client invitation: ${e}`);
    return DEFAULT_LOCALE;
  }
}
