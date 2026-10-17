import { combinedServices } from '../../../common/testing/combined-services';
import { SupportService } from '../support.service';
import { SupportInboxService } from '../support-inbox.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of SupportService, as ONE object — the tests were written against the single class. */
export type SupportServiceParts = Public<SupportService> & Public<SupportInboxService>;

export function supportParts(...args: unknown[]): SupportServiceParts {
  return combinedServices<SupportServiceParts>(
    new (SupportService as unknown as new (...a: unknown[]) => object)(...args),
    new (SupportInboxService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function supportPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): SupportServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [SupportService, SupportInboxService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<SupportServiceParts>(...parts);
}
