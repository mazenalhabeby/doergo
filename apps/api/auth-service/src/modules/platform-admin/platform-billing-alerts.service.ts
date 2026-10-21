import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { success } from '@hbcfield/shared';

/** Operator billing alerts: bills that fell and syncs that failed, and marking one as looked at. */
@Injectable()
export class PlatformBillingAlertsService {

  constructor(private readonly prisma: PrismaService) {}

  /**
   * How an organization pays us.
   *
   * The most consequential switch on this console, so it is written to be hard
   * to use by accident:
   *
   *   • INVOICE is refused without a billing email. An invoice with nowhere to
   *     go is discovered a month later, as a payment that never arrived —
   *     checked where the mode is SET, not where the invoice is sent.
   *   • A LIVE subscription is moved, not recreated. Its prices, history and
   *     period stay put, so this is a billing decision rather than a migration,
   *     and a customer mid-month is not re-charged.
   *   • Stripe first, database second. If Stripe refuses, nothing is written
   *     and the console still shows the truth; the reverse order would leave a
   *     row claiming a collection method Stripe never accepted.
   *   • `billedExternally` is written in step. Nothing reads it any more, but
   *     reports and scripts do, and a boolean that silently stops tracking its
   *     replacement is worse than one that is gone.
   */
  /**
   * Bills that fell, newest first.
   *
   * Unacknowledged by default: the question an operator asks is "what changed
   * recently and have we looked at it?", which is a list with a state rather
   * than a feed. Capped at 200 — a console that has to paginate a backlog this
   * size has a bigger problem than pagination.
   */
  async listBillingAlerts(data: { includeAcknowledged?: boolean }) {
    const rows = await this.prisma.billingAlert.findMany({
      where: data.includeAcknowledged ? {} : { acknowledgedAt: null },
      // By LAST SEEN, not first: a sync that failed again a minute ago matters
      // more than one that opened last week and stopped.
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
      // The organization's NAME, not just its id: an alert identified by a cuid
      // is one somebody has to go and look up before they can act on it.
      include: { organization: { select: { id: true, name: true, billingMode: true } } },
    });
    return success(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        organizationId: r.organizationId,
        organizationName: r.organization?.name ?? '—',
        billingMode: r.organization?.billingMode ?? 'AUTOMATIC',
        fromCents: r.fromCents,
        toCents: r.toCents,
        dropCents: r.dropCents,
        detail: r.detail,
        occurrences: r.occurrences,
        lastSeenAt: r.lastSeenAt,
        createdAt: r.createdAt,
        acknowledgedAt: r.acknowledgedAt,
        acknowledgedBy: r.acknowledgedBy,
      })),
    );
  }

  /** Mark one as looked at. Idempotent — acknowledging twice is not an error. */
  async acknowledgeBillingAlert(data: { id: string; byUserId?: string }) {
    const alert = await this.prisma.billingAlert.findUnique({ where: { id: data.id }, select: { id: true, acknowledgedAt: true } });
    if (!alert) return { success: false, statusCode: 404, message: 'Alert not found' };
    if (alert.acknowledgedAt) return success({ id: alert.id, acknowledgedAt: alert.acknowledgedAt });
    const updated = await this.prisma.billingAlert.update({
      where: { id: data.id },
      data: { acknowledgedAt: new Date(), acknowledgedBy: data.byUserId ?? null },
    });
    return success({ id: updated.id, acknowledgedAt: updated.acknowledgedAt });
  }
}
