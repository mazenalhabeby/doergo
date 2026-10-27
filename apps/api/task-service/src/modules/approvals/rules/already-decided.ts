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
