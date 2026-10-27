import { combinedServices } from '../../../common/testing/combined-services';
import { OvertimeService } from '../overtime.service';
import { OvertimeDecisionService } from '../overtime-decision.service';
import { noOfficeRules } from '../../approvals/__tests__/no-office-rules';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of OvertimeService, as ONE object — the tests were written against the single class. */
export type OvertimeServiceParts = Public<OvertimeService> & Public<OvertimeDecisionService>;

/**
 * The arguments keep the order of the old shared constructor (prisma, notifications,
 * the overtime queue, attendance, the decided close); the queue was never read and
 * is dropped. Each service gets only what it uses.
 */
export function overtimeServices(
  prisma?: unknown,
  notificationClient?: unknown,
  _overtimeQueue?: unknown,
  attendance?: unknown,
  decidedClose?: unknown,
  rules: unknown = noOfficeRules(),
): OvertimeServiceParts {
  return combinedServices<OvertimeServiceParts>(
    new OvertimeService(
      prisma as never,
      notificationClient as never,
      attendance as never,
      decidedClose as never,
      rules as never,
    ),
    new OvertimeDecisionService(prisma as never, notificationClient as never, attendance as never, rules as never),
  );
}
