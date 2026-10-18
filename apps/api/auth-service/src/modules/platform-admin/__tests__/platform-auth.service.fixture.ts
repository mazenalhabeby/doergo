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
