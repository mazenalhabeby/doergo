import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success } from '@hbcfield/shared';

/** Operator trials: ending one now, or extending it. */
@Injectable()
export class PlatformTrialService {
  private readonly logger = new Logger(PlatformTrialService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * End a trial now, rather than waiting for it to run out.
   *
   * The mirror of extendTrial, and the operator half of a deliberate flow: the
   * customer sees no "Set up payment" while they are trialing — nothing is owed
   * yet, and asking for a card mid-trial is asking a question they have not
   * reached — so somebody here decides when the trial is over and the
   * conversation about paying begins.
   *
   * Does exactly what `expireTrials()` does on the hour, and no more: status to
   * INCOMPLETE on both rows, `trialEndsAt` moved to now so the record agrees
   * with the state. Reusing the same end-state rather than inventing a second
   * one is the point — two ways to end a trial that differ by a field is how a
   * customer ends up in a state no guard was written for.
   *
   * Refused once a real subscription exists: `expireTrials` skips those (they
   * are paying, so there is nothing to expire), and locking a paying customer
   * out of their own account is not something an operator should be able to do
   * by clicking the wrong row.
   */
  async endTrial(data: { organizationId: string; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: {
        id: true, name: true, subStatus: true,
        subscription: { select: { stripeSubscriptionId: true } },
      },
    });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    if (org.subStatus !== 'TRIALING') {
      return { success: false, statusCode: 400, message: 'This organization is not on a trial.' } as any;
    }
    if (org.subscription?.stripeSubscriptionId) {
      return {
        success: false,
        statusCode: 400,
        message: 'This organization already has a subscription — end the trial in Stripe, not here.',
      } as any;
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: org.id },
        data: { subStatus: 'INCOMPLETE', trialEndsAt: now },
      }),
      this.prisma.subscription.updateMany({
        where: { organizationId: org.id },
        data: { status: 'INCOMPLETE' },
      }),
    ]);
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) trial ENDED by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, subStatus: 'INCOMPLETE', trialEndsAt: now });
  }

  async extendTrial(data: { organizationId: string; days: number; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, name: true, trialEndsAt: true } });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    const days = Math.max(1, Math.min(365, Math.floor(data.days || 0)));
    const base = org.trialEndsAt && org.trialEndsAt.getTime() > Date.now() ? org.trialEndsAt.getTime() : Date.now();
    const trialEndsAt = new Date(base + days * 86_400_000);
    await this.prisma.organization.update({ where: { id: org.id }, data: { trialEndsAt, subStatus: 'TRIALING' } });
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) trial extended +${days}d → ${trialEndsAt.toISOString()} by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, trialEndsAt });
  }
}
