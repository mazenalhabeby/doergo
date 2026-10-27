import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * An approve write is CONDITIONAL on the item still waiting (`update({ where: { id, status: PENDING } })`): a
 * refusal landing at the same moment wins once, and is never overwritten by the approval. Prisma reports the
 * miss as P2025; this turns it into the 409 the screens show (and `decide()` does not reopen the step for it).
 */
export function alreadyDecided(code: string, message: string) {
  return (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025')
      throw new ConflictException({ code, message });
    throw e;
  };
}

/** The code of a write refused because the item CHANGED meanwhile (not decided): look again and decide again. */
export const CHANGED_MEANWHILE = 'CHANGED_MEANWHILE';

/**
 * A write refused because something else moved the item meanwhile (new hours, new dates, a new end) — nobody
 * decided it, but the approvals were given for what it was, so `decide()` ends them like any 409.
 */
export class ChangedMeanwhileException extends ConflictException {
  constructor(message: string) {
    super({ code: CHANGED_MEANWHILE, message });
  }
}

/**
 * A conditional write that missed: DECIDED meanwhile (refused, approved by somebody else) → `decidedCode`; only
 * CHANGED meanwhile (another path moved the item, it still waits) → `CHANGED_MEANWHILE`, "look again". Either way
 * the approvals end. `stillWaiting` re-reads the item so the screen says which — never a guess from the miss.
 */
export function missedWrite(stillWaiting: () => Promise<boolean>, decidedCode: string, message: string) {
  return async (e: unknown): Promise<never> => {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025')) throw e;
    if (await stillWaiting()) throw new ChangedMeanwhileException('It changed a moment ago — look again and decide.');
    throw new ConflictException({ code: decidedCode, message });
  };
}
