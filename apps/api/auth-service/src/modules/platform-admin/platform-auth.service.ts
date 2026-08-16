import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BCRYPT_COST_FACTOR, PLATFORM_ROLES, platformCapsFor, isSupportSupervisor, type PlatformRole } from '@hbcfield/shared';
import { generateBase32Secret, verifyTotp, otpauthUri } from './totp.util';

const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60_000;
const TOKEN_TTL = '12h';
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
    return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role, isActive: u.isActive, twoFactorEnabled: u.twoFactorEnabled, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt };
  }

  // ── Login (2FA-aware) ─────────────────────────────────────────────────────────
  async login(data: { email?: string; password?: string; code?: string }) {
    const email = (data.email ?? '').trim().toLowerCase();
    const password = data.password ?? '';
    const invalid = fail('Invalid email or password', 401); // generic → no enumeration
    if (!email || !password) return invalid;

    const user = await this.prisma.platformUser.findUnique({ where: { email } });
    if (!user || !user.isActive) return invalid;
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return fail('Account temporarily locked. Try again later.', 423);

    const bump = async () => {
      const attempts = user.failedLoginAttempts + 1;
      await this.prisma.platformUser.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts, lockedUntil: attempts >= MAX_FAILED ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil } });
    };

    if (!(await bcrypt.compare(password, user.passwordHash))) { await bump(); return invalid; }

    // Second factor.
    if (user.twoFactorEnabled) {
      if (!data.code) return ok({ needs2fa: true }); // password OK → prompt for the code
      if (!verifyTotp(user.twoFactorSecret ?? '', data.code)) { await bump(); return fail('Invalid authentication code', 401); }
    }

    await this.prisma.platformUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const token = this.jwt.sign({ sub: user.id, role: user.role, typ: 'platform' }, { secret: this.secret(), expiresIn: TOKEN_TTL });
    const scope = await this.supportScope(user.id, user.role);
    this.logger.log(`[PLATFORM] login: ${user.email} (${user.role})`);
    return ok({ token, user: { ...this.publicUser(user), ...scope }, permissions: platformCapsFor(user.role) });
  }

  // ── Self-service: change own password ─────────────────────────────────────────
  async changePassword(data: { userId: string; currentPassword?: string; newPassword?: string }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    if (!(await bcrypt.compare(data.currentPassword ?? '', user.passwordHash))) return fail('Current password is incorrect', 401);
    if (!data.newPassword || data.newPassword.length < 10) return fail('New password must be at least 10 characters');
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.newPassword, BCRYPT_COST_FACTOR) } });
    this.logger.log(`[PLATFORM] ${user.email} changed their password`);
    return ok({ id: user.id });
  }

  // ── Self-service: 2FA (TOTP) ──────────────────────────────────────────────────
  /** Generate a secret (not yet enabled) + the otpauth URI for the authenticator. */
  async setup2fa(data: { userId: string }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    const secret = generateBase32Secret();
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorSecret: secret, twoFactorEnabled: false } });
    return ok({ secret, otpauthUri: otpauthUri(user.email, secret) });
  }

  /** Confirm the first code → turn 2FA on. */
  async enable2fa(data: { userId: string; code?: string }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user || !user.twoFactorSecret) return fail('Start 2FA setup first', 400);
    if (!verifyTotp(user.twoFactorSecret, data.code ?? '')) return fail('Invalid code', 400);
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    this.logger.warn(`[PLATFORM] ${user.email} enabled 2FA`);
    return ok({ twoFactorEnabled: true });
  }

  /** Turn 2FA off — requires a current code (proves possession). */
  async disable2fa(data: { userId: string; code?: string }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    if (user.twoFactorEnabled && !verifyTotp(user.twoFactorSecret ?? '', data.code ?? '')) return fail('Invalid code', 400);
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    this.logger.warn(`[PLATFORM] ${user.email} disabled 2FA`);
    return ok({ twoFactorEnabled: false });
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
      const scope = await this.supportScope(user.id, user.role);
      return { valid: true, user: { ...this.publicUser(user), ...scope }, permissions: platformCapsFor(user.role) };
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
    const email = (data.email ?? '').trim().toLowerCase();
    const role = this.validRole(data.role);
    if (!email || !email.includes('@')) return fail('Valid email required');
    if (!data.password || data.password.length < 10) return fail('Password must be at least 10 characters');
    if (!role) return fail('Invalid role');
    if (await this.prisma.platformUser.findUnique({ where: { email } })) return fail('A platform user with this email already exists', 409);
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR);
    const user = await this.prisma.platformUser.create({
      data: { email, passwordHash, firstName: (data.firstName ?? '').trim() || 'Staff', lastName: (data.lastName ?? '').trim() || '', role, createdById: data.byUserId ?? null },
    });
    this.logger.warn(`[PLATFORM] user created: ${email} (${role}) by ${data.byUserId ?? 'bootstrap'}`);
    return ok(this.publicUser(user));
  }

  async updateUser(data: { id: string; role?: string; isActive?: boolean; byUserId?: string }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.id } });
    if (!user) return fail('Not found', 404);
    const patch: any = {};
    if (data.role !== undefined) { const r = this.validRole(data.role); if (!r) return fail('Invalid role'); patch.role = r; }
    if (data.isActive !== undefined) patch.isActive = !!data.isActive;
    // Safety: never leave zero active OWNERs (can't demote/deactivate the last owner).
    const demotingOwner = user.role === 'OWNER' && ((patch.role && patch.role !== 'OWNER') || patch.isActive === false);
    if (demotingOwner) {
      const owners = await this.prisma.platformUser.count({ where: { role: 'OWNER', isActive: true } });
      if (owners <= 1) return fail('Cannot remove the last active Owner');
    }
    // Deactivating/demoting resets any lockout implicitly on next login.
    const updated = await this.prisma.platformUser.update({ where: { id: user.id }, data: patch });
    this.logger.warn(`[PLATFORM] user ${user.email} updated (${JSON.stringify(patch)}) by ${data.byUserId ?? 'operator'}`);
    return ok(this.publicUser(updated));
  }

  async resetPassword(data: { id: string; password?: string; byUserId?: string }) {
    if (!data.password || data.password.length < 10) return fail('Password must be at least 10 characters');
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.id } });
    if (!user) return fail('Not found', 404);
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.password, BCRYPT_COST_FACTOR), failedLoginAttempts: 0, lockedUntil: null } });
    this.logger.warn(`[PLATFORM] password reset for ${user.email} by ${data.byUserId ?? 'operator'}`);
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
