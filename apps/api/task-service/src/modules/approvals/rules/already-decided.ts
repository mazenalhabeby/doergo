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

/** The code of a write refused because the item CHANGED meanwhile (not decided): `decide()` keeps the approvals. */
export const CHANGED_MEANWHILE = 'CHANGED_MEANWHILE';

/** A write refused because something else moved the item meanwhile — nobody decided it (`decide()` reopens). */
export class ChangedMeanwhileException extends ConflictException {
  constructor(message: string) {
    super({ code: CHANGED_MEANWHILE, message });
  }
}

/**
 * A conditional write that missed: DECIDED meanwhile (refused, approved by somebody else) → `decidedCode`, and the
 * approvals end with it; only CHANGED meanwhile (another path moved the item, it still waits) → the approvals stay
 * for a retry. `stillWaiting` re-reads the item to tell the two apart — never a guess from the miss itself.
 */
export function missedWrite(stillWaiting: () => Promise<boolean>, decidedCode: string, message: string) {
  return async (e: unknown): Promise<never> => {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025')) throw e;
    if (await stillWaiting()) throw new ChangedMeanwhileException('It changed a moment ago — try again.');
    throw new ConflictException({ code: decidedCode, message });
  };
}
