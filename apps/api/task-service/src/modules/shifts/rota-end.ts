import type { Prisma } from '@prisma/client';
import { notEndedWhere } from '@hbcfield/shared';

/** The two tables this touches — a transaction client or the PrismaService itself. */
type RotaDb = Pick<Prisma.TransactionClient, 'shiftAssignment' | 'shiftInstance'>;

/**
 * Whose rota: a person (or several) in one workspace, a person in every workspace of an organization, or everybody
 * in one workspace. The workspace alone is precise — a guest's rota in a shared workspace may carry either org.
 */
export type RotaScope = { organizationId?: string; userId?: string | { in: string[] }; spaceId?: string };

/**
 * The shifts still ahead that nobody has acted on yet. Dropped when the person stops being expected: their clock
 * switched off (review A7), taken off a workspace, a workspace archived, gone from the organization. The past —
 * and anything already reminded, present or decided — is kept.
 */
export async function dropUpcomingShifts(db: RotaDb, scope: RotaScope, now: Date = new Date()): Promise<number> {
  const { count } = await db.shiftInstance.deleteMany({
    where: { ...scopeWhere(scope), state: 'PENDING', expectedClockInAt: { gt: now } },
  });
  return count;
}

/**
 * Somebody is no longer planned there: their rota rows END now (never deleted — a past rota is what a past
 * no-show and a past wallchart were read from) and the shifts already materialized ahead go.
 *
 * ⚠️ Every way off a workspace calls this: taking a member off (both routes), archiving it, a revoked share,
 * leaving the organization. A row left running kept the materializer expecting them — a no-show every day,
 * chased at a person who no longer works there. A row already ended keeps its own date.
 */
export async function endRotaFor(
  db: RotaDb,
  scope: RotaScope,
  now: Date = new Date(),
): Promise<{ rotaEnded: number; shiftsDropped: number }> {
  const { count: rotaEnded } = await db.shiftAssignment.updateMany({
    where: { ...scopeWhere(scope), ...notEndedWhere(now) },
    data: { effectiveTo: now },
  });
  const shiftsDropped = await dropUpcomingShifts(db, scope, now);
  return { rotaEnded, shiftsDropped };
}

function scopeWhere(scope: RotaScope) {
  // Never a whole organization, never everything: a scope missing both would end every rota there is.
  if (!scope.spaceId && !(scope.userId && scope.organizationId))
    throw new Error('A rota scope needs a workspace or a person');
  return {
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
    ...(scope.userId ? { userId: scope.userId } : {}),
    ...(scope.spaceId ? { spaceId: scope.spaceId } : {}),
  };
}
