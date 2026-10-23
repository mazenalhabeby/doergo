import type { PlatformUser } from '@prisma/client';
import { type PrismaService, PLATFORM_ROLES, type PlatformRole, platformEnrolmentRequired } from '@hbcfield/shared';
import { matchTotpStep } from './totp.util';

const ok = <T>(data: T) => ({ success: true, data });

const fail = (message: string, statusCode = 400) => ({ success: false, statusCode, message });

export { ok, fail };

/** An operator as the console sees them. */
export function publicUser(u: PlatformUser) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    isActive: u.isActive,
    twoFactorEnabled: u.twoFactorEnabled,
    // Mandatory second factor: until one is enrolled this session reaches
    // /platform/auth/* only (enforced by the gateway's platform guard).
    enrolmentRequired: platformEnrolmentRequired(u),
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/**
 * Accept a TOTP code ONCE.
 *
 * The step the code matched is written with a conditional update that only
 * succeeds when it is newer than the last accepted step — so a code (or an
 * older one still inside the ±1 window) cannot be used a second time, and two
 * requests racing with the same code cannot both pass.
 */
export async function consumeTotp(
  prisma: PrismaService,
  userId: string,
  secret: string | null,
  code: string | undefined,
): Promise<boolean> {
  const step = matchTotpStep(secret ?? '', code ?? '');
  if (step === null) return false;
  const claimed = await prisma.platformUser.updateMany({
    where: { id: userId, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
    data: { twoFactorLastStep: step },
  });
  return claimed.count === 1;
}

/** A role the console knows, upper-cased, or null. */
export function validRole(role?: string): PlatformRole | null {
  const r = (role ?? '').toUpperCase();
  return (PLATFORM_ROLES as string[]).includes(r) ? (r as PlatformRole) : null;
}
