import { combinedServices } from '../../../common/testing/combined-services';
import { SupportService } from '../support.service';
import { SupportInboxService } from '../support-inbox.service';
import { SupportTicketLookup } from '../support-ticket-lookup.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of SupportService, as ONE object — the tests were written against the single class. */
export type SupportServiceParts = Public<SupportService> & Public<SupportInboxService>;

/** `(prisma, notificationClient, supportQueue)` — the shared ticket reads are built from the same prisma. */
export function supportParts(prisma: unknown, ...rest: unknown[]): SupportServiceParts {
  const tickets = new SupportTicketLookup(prisma as never);
  return combinedServices<SupportServiceParts>(
    new (SupportService as unknown as new (...a: unknown[]) => object)(prisma, ...rest, tickets),
    new (SupportInboxService as unknown as new (...a: unknown[]) => object)(prisma, tickets),
  );
}
