import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_COST_FACTOR, type PlatformRole, normalizeEmail, maskEmail } from '@hbcfield/shared';
import { ok, fail } from './platform-auth-helpers';
import { PlatformAuthBase } from './platform-auth.base';

/** The operators themselves: listing, adding, editing, resetting a password, the first owner. */
@Injectable()
export class PlatformStaffService extends PlatformAuthBase {

  // ── Staff management (OWNER only — enforced at the gateway) ────────────────────
  async listUsers() {
    const users = await this.prisma.platformUser.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
    return ok(users.map((u) => this.publicUser(u)));
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
