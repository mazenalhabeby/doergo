import { combinedServices } from '../../../common/testing/combined-services';
import { PlatformAuthService } from '../platform-auth.service';
import { PlatformTwoFactorService } from '../platform-two-factor.service';
import { PlatformStaffService } from '../platform-staff.service';
import { PlatformSessionService } from '../platform-session.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of PlatformAuthService, as ONE object — the tests were written against the single class. */
export type PlatformAuthServiceParts = Public<PlatformAuthService> &
  Public<PlatformTwoFactorService> &
  Public<PlatformStaffService>;

/** `(prisma, jwt, config)` wired the way PlatformAdminModule wires them. */
export function platformAuthParts(prisma: unknown, jwt: unknown, config: unknown): PlatformAuthServiceParts {
  const db = prisma as never;
  const sessions = new PlatformSessionService(db, jwt as never, config as never);
  return combinedServices<PlatformAuthServiceParts>(
    new PlatformAuthService(db, jwt as never, sessions),
    new PlatformTwoFactorService(db, sessions),
    new PlatformStaffService(db),
  );
}
