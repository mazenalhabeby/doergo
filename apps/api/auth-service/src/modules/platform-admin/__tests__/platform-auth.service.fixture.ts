import { combinedServices } from '../../../common/testing/combined-services';
import { PlatformAuthService } from '../platform-auth.service';
import { PlatformTwoFactorService } from '../platform-two-factor.service';
import { PlatformStaffService } from '../platform-staff.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of PlatformAuthService, as ONE object — the tests were written against the single class. */
export type PlatformAuthServiceParts = Public<PlatformAuthService> & Public<PlatformTwoFactorService> & Public<PlatformStaffService>;

export function platformAuthParts(...args: unknown[]): PlatformAuthServiceParts {
  const platformAuthService = new (PlatformAuthService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const platformTwoFactorService = new (PlatformTwoFactorService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const platformStaffService = new (PlatformStaffService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<PlatformAuthServiceParts>(platformAuthService, platformTwoFactorService, platformStaffService);
}

/** The same, from a Nest test module that registered them all. */
export function platformAuthPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): PlatformAuthServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [PlatformAuthService, PlatformTwoFactorService, PlatformStaffService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<PlatformAuthServiceParts>(...parts);
}
