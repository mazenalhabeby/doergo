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

/** The same, from a Nest test module that registered them all. */
export function leaveLedgerServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): LeaveLedgerServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [LeaveLedgerService, LeaveOpeningService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<LeaveLedgerServiceParts>(...parts);
}
