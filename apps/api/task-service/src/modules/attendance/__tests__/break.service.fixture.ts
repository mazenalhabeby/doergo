import { combinedServices } from '../../../common/testing/combined-services';
import { BreakService } from '../rests/break.service';
import { BreakStartService } from '../rests/break-start.service';
import { BreakStatusService } from '../rests/break-status.service';
import { BreakReadService } from '../rests/break-read.service';
import { OfficeBreaksService } from '../rests/office-breaks.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of BreakService, as ONE object — the tests were written against the single class. */
export type BreakServiceParts = Public<BreakService> &
  Public<BreakStatusService> &
  Public<BreakReadService> &
  Public<OfficeBreaksService>;

export function breakServices(...args: unknown[]): BreakServiceParts {
  return combinedServices<BreakServiceParts>(
    // (prisma, countedTime, notifications), then the rest starter built from the same doubles.
    new (BreakService as unknown as new (...a: unknown[]) => object)(
      ...Array.from({ length: 3 }, (_, i) => args[i]),
      new (BreakStartService as unknown as new (...a: unknown[]) => object)(args[0], args[2]),
    ),
    // Each part takes only what it uses: (prisma, countedTime) or (prisma).
    new (BreakStatusService as unknown as new (...a: unknown[]) => object)(args[0], args[1]),
    new (BreakReadService as unknown as new (...a: unknown[]) => object)(args[0]),
    new (OfficeBreaksService as unknown as new (...a: unknown[]) => object)(args[0], args[1]),
  );
}

/** The same, from a Nest test module that registered `BREAK_SERVICES`. */
export function breakServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): BreakServiceParts {
  return combinedServices<BreakServiceParts>(
    mod.get(BreakService),
    mod.get(BreakStatusService),
    mod.get(BreakReadService),
    mod.get(OfficeBreaksService),
  );
}
