import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BCRYPT_COST_FACTOR, PLATFORM_ROLES, platformCapsFor, isSupportSupervisor, type PlatformRole, normalizeEmail,
  tokenIssuedBeforeCutoff, maskEmail, nextLockStateAfterFailure, PLATFORM_TOKEN_TTL_SECONDS,
  platformEnrolmentRequired, platformLogoutCutoff, mayRefreshPlatformSession,
} from '@hbcfield/shared';
import { generateBase32Secret, matchTotpStep, otpauthUri } from './totp.util';

const ok = <T>(data: T) => ({ success: true, data });
const fail = (message: string, statusCode = 400) => ({ success: false, statusCode, message });

/**
 * Platform-staff authentication + RBAC. Fully isolated from customer auth:
 * tokens are signed with a SEPARATE secret (`PLATFORM_JWT_SECRET`) and carry
 * `typ:'platform'`, so a platform token can never be accepted as a customer
 * token (different key) and vice-versa. bcrypt(12) passwords, per-account
 * lockout after repeated failures, RBAC via the shared permission matrix.
 */
@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    const s = this.config.get<string>('PLATFORM_JWT_SECRET');
    if (!s) throw new Error('PLATFORM_JWT_SECRET not configured');
    return s;
  }
  private publicUser(u: any) {
    return {
      id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role, isActive: u.isActive,
      twoFactorEnabled: u.twoFactorEnabled,
      // Mandatory second factor: until one is enrolled this session reaches
      // /platform/auth/* only (enforced by the gateway's platform guard).
      enrolmentRequired: platformEnrolmentRequired(u),
      lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
    };
  }

  /**
   * Mint a platform token.
   *
   * `auth_time` is when the password (and code) were last typed; a refresh
   * carries it forward unchanged so a chain of refreshes cannot outlive
   * PLATFORM_SESSION_MAX_SECONDS. Short-lived (PLATFORM_TOKEN_TTL_SECONDS): the
   * console slides it while somebody is working.
   */
  private issueToken(user: { id: string; role: string }, authTime?: number): string {
    const now = Math.floor(Date.now() / 1000);
    return this.jwt.sign(
      { sub: user.id, role: user.role, typ: 'platform', auth_time: authTime ?? now },
      { secret: this.secret(), expiresIn: PLATFORM_TOKEN_TTL_SECONDS },
    );
  }

  /** The response every session-changing call returns: a fresh token + who you are now. */
  private async session(user: any, authTime?: number) {
    const scope = await this.supportScope(user.id, user.role);
    return {
      token: this.issueToken(user, authTime),
      expiresIn: PLATFORM_TOKEN_TTL_SECONDS,
      user: { ...this.publicUser(user), ...scope },
      permissions: platformCapsFor(user.role),
    };
  }

  /**
   * End every OTHER session of this operator and hand the caller a fresh one.
   *
   * Used by every change to the second factor: whoever else holds a token for
   * this account — the reason somebody re-keys their authenticator — is out.
   */
  private async rotateSessions(userId: string, authTime?: number) {
    const updated = await this.prisma.platformUser.update({ where: { id: userId }, data: { tokensValidAfter: new Date() } });
    return this.session(updated, authTime);
  }

  // ── Login (2FA-aware) ─────────────────────────────────────────────────────────
  async login(data: { email?: string; password?: string; code?: string }) {
    const email = normalizeEmail(data.email ?? '');
    const password = data.password ?? '';
    const invalid = fail('Invalid email or password', 401); // generic → no enumeration
    if (!email || !password) return invalid;

    const user = await this.prisma.platformUser.findUnique({ where: { email } });
    if (!user || !user.isActive) return invalid;
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return fail('Account temporarily locked. Try again later.', 423);

    // Same rule as member sign-in: an EXPIRED lock starts the count again, so
    // one wrong guess after a lock no longer re-locks the account forever.
    const bump = async () => {
      await this.prisma.platformUser.update({ where: { id: user.id }, data: nextLockStateAfterFailure(user) });
    };

    if (!(await bcrypt.compare(password, user.passwordHash))) { await bump(); return invalid; }

    // Second factor.
    if (user.twoFactorEnabled) {
      if (!data.code) return ok({ needs2fa: true }); // password OK → prompt for the code
      if (!(await this.consumeTotp(user.id, user.twoFactorSecret, data.code))) { await bump(); return fail('Invalid authentication code', 401); }
    }

    await this.prisma.platformUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const session = await this.session(user);
    this.logger.log(`[PLATFORM] login: ${maskEmail(user.email)} (${user.role})${session.user.enrolmentRequired ? ' — 2FA enrolment required' : ''}`);
    return ok(session);
  }

  /**
   * Sign out — server side.
   *
   * Moves the operator's session cut-off past the signing-out token, so the
   * token (and every other one this operator holds) is refused from now on.
   * One switch for all of an operator's sessions is deliberate: it is the
   * mechanism password changes already use, and "sign out" on a shared or lost
   * machine should not depend on which tab pressed it.
   */
  async logout(data: { userId: string; iat?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId }, select: { id: true, email: true } });
    if (!user) return fail('Not found', 404);
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { tokensValidAfter: platformLogoutCutoff(data.iat) } });
    this.logger.log(`[PLATFORM] logout: ${maskEmail(user.email)}`);
    return ok({ signedOut: true });
  }

  /**
   * Slide a live session forward. The token presented has already been
   * validated by the gateway guard (active, after the cut-off); this only
   * refuses a chain older than PLATFORM_SESSION_MAX_SECONDS.
   */
  async refresh(data: { userId: string; authTime?: number }) {
    if (!mayRefreshPlatformSession(data.authTime)) return fail('Session expired — sign in again', 401);
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user || !user.isActive) return fail('Session expired — sign in again', 401);
    return ok(await this.session(user, data.authTime));
  }

  /**
   * Accept a TOTP code ONCE.
   *
   * The step the code matched is written with a conditional update that only
   * succeeds when it is newer than the last accepted step — so a code (or an
   * older one still inside the ±1 window) cannot be used a second time, and two
   * requests racing with the same code cannot both pass.
   */
  private async consumeTotp(userId: string, secret: string | null, code: string | undefined): Promise<boolean> {
    const step = matchTotpStep(secret ?? '', code ?? '');
    if (step === null) return false;
    const claimed = await this.prisma.platformUser.updateMany({
      where: { id: userId, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
      data: { twoFactorLastStep: step },
    });
    return claimed.count === 1;
  }

  // ── Self-service: change own password ─────────────────────────────────────────
  async changePassword(data: { userId: string; currentPassword?: string; newPassword?: string; authTime?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    if (!(await bcrypt.compare(data.currentPassword ?? '', user.passwordHash))) return fail('Current password is incorrect', 401);
    if (!data.newPassword || data.newPassword.length < 10) return fail('New password must be at least 10 characters');
    // tokensValidAfter: every operator token already issued — on any machine —
    // stops working now. Changing the password is the answer to "somebody has
    // my session"; a 12-hour token outliving it would make that answer a lie.
    const updated = await this.prisma.platformUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.newPassword, BCRYPT_COST_FACTOR), tokensValidAfter: new Date() } });
    this.logger.log(`[PLATFORM] ${maskEmail(user.email)} changed their password`);
    // Every OTHER session ends; this one continues on a fresh token.
    return ok({ id: user.id, ...(await this.session(updated, data.authTime)) });
  }

  // ── Self-service: 2FA (TOTP) ──────────────────────────────────────────────────
  /**
   * Start enrolling an authenticator.
   *
   * The new secret is held as PENDING: the factor in force is untouched until a
   * code from the new one is verified (enable2fa). It used to be written
   * straight over the active secret with `twoFactorEnabled: false` — so anybody
   * holding a session (a stolen token, an unlocked laptop) could strip 2FA with
   * one request and no proof.
   *
   * While 2FA is ON, re-keying needs a CURRENT code: possession of the old
   * factor is what authorises replacing it.
   */
  async setup2fa(data: { userId: string; code?: string; authTime?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    if (user.twoFactorEnabled) {
      if (!data.code) return { ...fail('Enter a current code from your authenticator to replace it', 400), code: 'PLATFORM_2FA_CODE_REQUIRED' };
      if (!(await this.consumeTotp(user.id, user.twoFactorSecret, data.code))) return fail('Invalid code', 400);
    }
    const secret = generateBase32Secret();
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorPendingSecret: secret } });
    this.logger.warn(`[PLATFORM] ${maskEmail(user.email)} started 2FA enrolment`);
    const session = await this.rotateSessions(user.id, data.authTime);
    return ok({ secret, otpauthUri: otpauthUri(user.email, secret), ...session });
  }

  /**
   * Confirm a code from the PENDING secret → it becomes the factor in force.
   *
   * The step check is against the new secret, whose codes have never been
   * used, and the write is conditional on the pending secret still being the
   * one verified — two racing confirmations cannot swap in different secrets.
   */
  async enable2fa(data: { userId: string; code?: string; authTime?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user || !user.twoFactorPendingSecret) return fail('Start 2FA setup first', 400);
    const pending = user.twoFactorPendingSecret;
    const step = matchTotpStep(pending, data.code ?? '');
    if (step === null) return fail('Invalid code', 400);
    const claimed = await this.prisma.platformUser.updateMany({
      where: { id: user.id, twoFactorPendingSecret: pending },
      data: { twoFactorSecret: pending, twoFactorPendingSecret: null, twoFactorEnabled: true, twoFactorLastStep: step },
    });
    if (claimed.count !== 1) return fail('Start 2FA setup first', 409);
    this.logger.warn(`[PLATFORM] ${maskEmail(user.email)} enabled 2FA`);
    return ok({ twoFactorEnabled: true, ...(await this.rotateSessions(user.id, data.authTime)) });
  }

  /**
   * Turn 2FA off — requires a current code (proves possession).
   *
   * Every platform role must hold a second factor, so this does not free the
   * account: the session it returns is limited to enrolling a new one.
   */
  async disable2fa(data: { userId: string; code?: string; authTime?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    if (!user.twoFactorEnabled) return fail('Two-factor authentication is not on', 400);
    if (!(await this.consumeTotp(user.id, user.twoFactorSecret, data.code))) return fail('Invalid code', 400);
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorPendingSecret: null } });
    this.logger.warn(`[PLATFORM] ${maskEmail(user.email)} disabled 2FA`);
    return ok({ twoFactorEnabled: false, ...(await this.rotateSessions(user.id, data.authTime)) });
  }

  /**
   * An Owner clears somebody else's second factor (a lost phone).
   *
   * Never one's own — that would be a way round needing a code to disable it.
   * Ends every session of that operator; their next sign-in is enrolment-only.
   */
  async reset2fa(data: { id: string; byUserId?: string }) {
    if (!data.byUserId || data.id === data.byUserId) return fail('Use Security → Disable 2FA for your own account', 400);
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.id }, select: { id: true, email: true } });
    if (!user) return fail('Not found', 404);
    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorPendingSecret: null, twoFactorLastStep: null, tokensValidAfter: new Date() },
    });
    this.logger.warn(`[PLATFORM] 2FA reset for ${maskEmail(user.email)} by ${data.byUserId}`);
    return ok({ id: user.id, twoFactorEnabled: false });
  }

  /** The caller's support-team scope, resolved for inbox filtering. */
  private async supportScope(userId: string, role: string) {
    const memberships = await this.prisma.supportTeamMember.findMany({
      where: { platformUserId: userId },
      select: { teamId: true, teamRole: true },
    });
    return {
      isSupportSupervisor: isSupportSupervisor(role),
      supportTeamIds: memberships.map((m) => m.teamId),
      supportTeamRoles: memberships.map((m) => ({ teamId: m.teamId, teamRole: m.teamRole })),
    };
  }

  // ── Validate (called by the gateway guard on every request) ───────────────────
  async validateToken(token: string) {
    try {
      const payload = this.jwt.verify(token, { secret: this.secret(), algorithms: ['HS256'] });
      if (payload?.typ !== 'platform' || !payload?.sub) return { valid: false };
      const user = await this.prisma.platformUser.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) return { valid: false };
      // Issued before the operator's last password change/reset → dead.
      if (tokenIssuedBeforeCutoff(payload.iat, user.tokensValidAfter)) return { valid: false };
      const scope = await this.supportScope(user.id, user.role);
      return {
        valid: true,
        user: { ...this.publicUser(user), ...scope },
        permissions: platformCapsFor(user.role),
        // What logout and refresh need about THIS token (not the account).
        session: { iat: payload.iat, authTime: typeof payload.auth_time === 'number' ? payload.auth_time : payload.iat },
      };
    } catch {
      return { valid: false };
    }
  }

  async me(userId: string) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: userId } });
    if (!user) return fail('Not found', 404);
    const scope = await this.supportScope(user.id, user.role);
    return ok({ user: { ...this.publicUser(user), ...scope }, permissions: platformCapsFor(user.role) });
  }

  // ── Staff management (OWNER only — enforced at the gateway) ────────────────────
  async listUsers() {
    const users = await this.prisma.platformUser.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
    return ok(users.map((u) => this.publicUser(u)));
  }

  private validRole(role?: string): PlatformRole | null {
    const r = (role ?? '').toUpperCase();
    return (PLATFORM_ROLES as string[]).includes(r) ? (r as PlatformRole) : null;
  }

  async createUser(data: { email?: string; password?: string; firstName?: string; lastName?: string; role?: string; byUserId?: string }) {
    const email = normalizeEmail(data.email ?? '');
    const role = this.validRole(data.role);
    if (!email || !email.includes('@')) return fail('Valid email required');
    if (!data.password || data.password.length < 10) return fail('Password must be at least 10 characters');
    if (!role) return fail('Invalid role');
    if (await this.prisma.platformUser.findUnique({ where: { email } })) return fail('A platform user with this email already exists', 409);
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR);
    const user = await this.prisma.platformUser.create({
      data: { email, passwordHash, firstName: (data.firstName ?? '').trim() || 'Staff', lastName: (data.lastName ?? '').trim() || '', role, createdById: data.byUserId ?? null },
    });
    this.logger.warn(`[PLATFORM] user created: ${maskEmail(email)} (${role}) by ${data.byUserId ?? 'bootstrap'}`);
    return ok(this.publicUser(user));
  }

  /**
   * Change another operator's role or switch them off.
   *
   * Only `role` and `isActive` are read — the caller's body never reaches the
   * query, and the target is the PATH id (the gateway passes it last so a body
   * `id` cannot replace it).
   *
   * Refused: changing your own role or switching yourself off (an Owner who
   * demotes themselves by a mis-click has no Owner left to undo it, and nobody
   * should be able to quietly widen or narrow their own access), and leaving the
   * console with no active Owner.
   */
  async updateUser(data: { id: string; role?: string; isActive?: boolean; byUserId?: string }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.id } });
    if (!user) return fail('Not found', 404);
    const patch: { role?: PlatformRole; isActive?: boolean } = {};
    if (data.role !== undefined) { const r = this.validRole(data.role); if (!r) return fail('Invalid role'); patch.role = r; }
    if (data.isActive !== undefined) patch.isActive = data.isActive === true;
    const self = !!data.byUserId && data.byUserId === user.id;
    if (self && ((patch.role && patch.role !== user.role) || patch.isActive === false)) {
      return fail('You cannot change your own role or deactivate yourself — ask another Owner', 403);
    }
    // Safety: never leave zero active OWNERs (can't demote/deactivate the last owner).
    const demotingOwner = user.role === 'OWNER' && ((patch.role && patch.role !== 'OWNER') || patch.isActive === false);
    if (demotingOwner) {
      const owners = await this.prisma.platformUser.count({ where: { role: 'OWNER', isActive: true } });
      if (owners <= 1) return fail('Cannot remove the last active Owner');
    }
    // A role change or a switch-off ends their live sessions: the token carries
    // nothing the guard trusts, but a socket opened with it should not linger.
    const changesAccess = (patch.role && patch.role !== user.role) || patch.isActive === false;
    const updated = await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { ...patch, ...(changesAccess ? { tokensValidAfter: new Date() } : {}) },
    });
    this.logger.warn(`[PLATFORM] user ${maskEmail(user.email)} updated (${JSON.stringify(patch)}) by ${data.byUserId ?? 'operator'}`);
    return ok(this.publicUser(updated));
  }

  async resetPassword(data: { id: string; password?: string; byUserId?: string }) {
    if (!data.password || data.password.length < 10) return fail('Password must be at least 10 characters');
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.id } });
    if (!user) return fail('Not found', 404);
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.password, BCRYPT_COST_FACTOR), failedLoginAttempts: 0, lockedUntil: null, tokensValidAfter: new Date() } });
    this.logger.warn(`[PLATFORM] password reset for ${maskEmail(user.email)} by ${data.byUserId ?? 'operator'}`);
    return ok({ id: user.id });
  }

  // ── Break-glass bootstrap (shared-key gated at the gateway) ────────────────────
  /** Create the first OWNER. Refuses if any active OWNER already exists. */
  async bootstrapOwner(data: { email?: string; password?: string; firstName?: string; lastName?: string }) {
    const existing = await this.prisma.platformUser.count({ where: { role: 'OWNER', isActive: true } });
    if (existing > 0) return fail('An owner already exists — use the Team screen to add staff', 409);
    return this.createUser({ ...data, role: 'OWNER', byUserId: 'bootstrap' });
  }
}
