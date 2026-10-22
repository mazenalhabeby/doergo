import { combinedServices } from '../../../common/testing/combined-services';
import { CredentialExpiryService } from '../registers/credential-expiry.service';
import { ComplianceBoardService } from '../registers/compliance-board.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of CredentialExpiryService, as ONE object — the tests were written against the single class. */
export type CredentialExpiryServiceParts = Public<CredentialExpiryService> & Public<ComplianceBoardService>;

export function credentialExpiryParts(...args: unknown[]): CredentialExpiryServiceParts {
  const credentialExpiryService = new (CredentialExpiryService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const complianceBoardService = new (ComplianceBoardService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<CredentialExpiryServiceParts>(credentialExpiryService, complianceBoardService);
}

/** The same, from a Nest test module that registered them all. */
export function credentialExpiryPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): CredentialExpiryServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [CredentialExpiryService, ComplianceBoardService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<CredentialExpiryServiceParts>(...parts);
}
