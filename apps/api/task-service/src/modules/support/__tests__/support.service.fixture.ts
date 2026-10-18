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
