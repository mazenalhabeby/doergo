import { combinedServices } from '../../../common/testing/combined-services';
import { InvitationService } from '../invitation.service';
import { InvitationAcceptService } from '../invitation-accept.service';
import { InvitationAdminService } from '../invitation-admin.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of InvitationService, as ONE object — the tests were written against the single class. */
export type InvitationServiceParts = Public<InvitationService> &
  Public<InvitationAcceptService> &
  Public<InvitationAdminService>;

/**
 * The three services wired by hand: `(prisma, notificationClient, documents?, billing?)`,
 * each given only the collaborators its constructor asks for.
 */
export function invitationServices(
  prisma: unknown,
  notificationClient: unknown,
  documents?: unknown,
  billing?: unknown,
): InvitationServiceParts {
  const db = prisma as never;
  const notify = notificationClient as never;
  return combinedServices<InvitationServiceParts>(
    new InvitationService(db, notify),
    new InvitationAcceptService(db, documents as never, billing as never),
    new InvitationAdminService(db, notify),
  );
}
