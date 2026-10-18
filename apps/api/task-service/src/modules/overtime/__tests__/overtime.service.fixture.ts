import { combinedServices } from '../../../common/testing/combined-services';
import { OvertimeService } from '../overtime.service';
import { OvertimeDecisionService } from '../overtime-decision.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of OvertimeService, as ONE object — the tests were written against the single class. */
export type OvertimeServiceParts = Public<OvertimeService> & Public<OvertimeDecisionService>;

export function overtimeServices(...args: unknown[]): OvertimeServiceParts {
  return combinedServices<OvertimeServiceParts>(
    new (OvertimeService as unknown as new (...a: unknown[]) => object)(...args),
    new (OvertimeDecisionService as unknown as new (...a: unknown[]) => object)(...args),
  );
}
