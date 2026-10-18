import { combinedServices } from '../../../common/testing/combined-services';
import { LeaveLedgerService } from '../leave-ledger.service';
import { LeaveOpeningService } from '../leave-opening.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of LeaveLedgerService, as ONE object — the tests were written against the single class. */
export type LeaveLedgerServiceParts = Public<LeaveLedgerService> & Public<LeaveOpeningService>;

export function leaveLedgerServices(...args: unknown[]): LeaveLedgerServiceParts {
  return combinedServices<LeaveLedgerServiceParts>(
    new (LeaveLedgerService as unknown as new (...a: unknown[]) => object)(...args),
    new (LeaveOpeningService as unknown as new (...a: unknown[]) => object)(...args),
  );
}
