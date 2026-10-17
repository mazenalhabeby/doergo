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

export function invitationServices(...args: unknown[]): InvitationServiceParts {
  return combinedServices<InvitationServiceParts>(
    new (InvitationService as unknown as new (...a: unknown[]) => object)(...args),
    new (InvitationAcceptService as unknown as new (...a: unknown[]) => object)(...args),
    new (InvitationAdminService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function invitationServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): InvitationServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [InvitationService, InvitationAcceptService, InvitationAdminService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<InvitationServiceParts>(...parts);
}
