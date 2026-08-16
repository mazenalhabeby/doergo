import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PLANS, FIELD_SEAT_MONTHLY_CENTS, IN_HOUSE_FIELD_SEAT_MONTHLY_CENTS, type PlanTier } from '@hbcfield/shared';

const ok = <T>(data: T) => ({ success: true, data });
const fail = (message: string, statusCode = 400) => ({ success: false, statusCode, message });
const ANNUAL = (monthly: number) => monthly * 10; // 2 months free

/**
 * C2 — editable, versioned price book. The active config is the source of truth
 * for DISPLAY; edits write a DRAFT version and publishing swaps `active`. This
 * layer NEVER touches Stripe — the `stripePriceId` columns are filled by C3. On
 * first read it seeds v1 from the current code constants so nothing changes on
 * day one.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  constructor(private readonly prisma: PrismaService) {}

  private include = { seatPrices: true, modulePrices: true } as const;

  /** Seed v1 (active) from PLANS + seat constants if no config exists yet. */
  private async ensureSeeded() {
    const count = await this.prisma.pricingConfig.count();
    if (count > 0) return;
    const seat = (seatType: string, tier: string | null, monthly: number) => ({ seatType, tier, monthlyCents: monthly, annualCents: ANNUAL(monthly) });
    try {
      await this.prisma.pricingConfig.create({
        data: {
          version: 1, active: true, note: 'Seeded from launch pricing', createdBy: 'system',
          seatPrices: {
            create: [
              seat('office', 'starter', PLANS.starter.officeMonthlyCents ?? 2900),
              seat('office', 'professional', PLANS.professional.officeMonthlyCents ?? 5900),
              seat('office', 'business', PLANS.business.officeMonthlyCents ?? 9900),
              seat('field', null, FIELD_SEAT_MONTHLY_CENTS),
              seat('field_inhouse', null, IN_HOUSE_FIELD_SEAT_MONTHLY_CENTS),
            ],
          },
        },
      });
      this.logger.warn('[PLATFORM] pricing v1 seeded from constants');
    } catch {
      /* race: another request seeded it — fine (version 1 is unique) */
    }
  }

  async getActive() {
    await this.ensureSeeded();
    const active = await this.prisma.pricingConfig.findFirst({ where: { active: true }, include: this.include, orderBy: { version: 'desc' } });
    return ok(active);
  }

  async list() {
    await this.ensureSeeded();
    const configs = await this.prisma.pricingConfig.findMany({ include: this.include, orderBy: { version: 'desc' } });
    return ok(configs);
  }

  /** Clone the active book into a new (inactive) draft to edit safely. */
  async createDraft(data: { byUserId?: string; note?: string }) {
    await this.ensureSeeded();
    const base = await this.prisma.pricingConfig.findFirst({ where: { active: true }, include: this.include, orderBy: { version: 'desc' } });
    const maxV = await this.prisma.pricingConfig.aggregate({ _max: { version: true } });
    const version = (maxV._max.version ?? 0) + 1;
    const draft = await this.prisma.pricingConfig.create({
      data: {
        version, active: false, note: data.note?.slice(0, 200) ?? `Draft v${version}`, createdBy: data.byUserId ?? null,
        seatPrices: { create: (base?.seatPrices ?? []).map((s) => ({ seatType: s.seatType, tier: s.tier, monthlyCents: s.monthlyCents, annualCents: s.annualCents })) },
        modulePrices: { create: (base?.modulePrices ?? []).map((m) => ({ moduleKey: m.moduleKey, monthlyCents: m.monthlyCents, annualCents: m.annualCents, billingScope: m.billingScope })) },
      },
      include: this.include,
    });
    return ok(draft);
  }

  private async assertDraft(configId: string) {
    const cfg = await this.prisma.pricingConfig.findUnique({ where: { id: configId } });
    if (!cfg) return { err: fail('Version not found', 404) };
    if (cfg.active) return { err: fail('Published versions are read-only. Create a draft to edit.', 409) };
    return { cfg };
  }

  async updateSeatPrice(data: { configId: string; seatPriceId: string; monthlyCents?: number; annualCents?: number }) {
    const { err } = await this.assertDraft(data.configId);
    if (err) return err;
    const monthly = Math.max(0, Math.round(Number(data.monthlyCents)));
    const patch: any = {};
    if (!isNaN(monthly)) { patch.monthlyCents = monthly; patch.annualCents = data.annualCents != null ? Math.max(0, Math.round(Number(data.annualCents))) : ANNUAL(monthly); }
    else if (data.annualCents != null) patch.annualCents = Math.max(0, Math.round(Number(data.annualCents)));
    const updated = await this.prisma.seatPrice.update({ where: { id: data.seatPriceId }, data: patch });
    return ok(updated);
  }

  async upsertModulePrice(data: { configId: string; moduleKey: string; monthlyCents: number; annualCents?: number; billingScope?: string }) {
    const { err } = await this.assertDraft(data.configId);
    if (err) return err;
    if (!data.moduleKey) return fail('moduleKey required');
    const monthly = Math.max(0, Math.round(Number(data.monthlyCents) || 0));
    const annual = data.annualCents != null ? Math.max(0, Math.round(Number(data.annualCents))) : ANNUAL(monthly);
    const scope = ['per_org', 'per_office_seat', 'per_space'].includes(data.billingScope ?? '') ? data.billingScope! : 'per_org';
    const existing = await this.prisma.modulePrice.findFirst({ where: { configId: data.configId, moduleKey: data.moduleKey } });
    const row = existing
      ? await this.prisma.modulePrice.update({ where: { id: existing.id }, data: { monthlyCents: monthly, annualCents: annual, billingScope: scope } })
      : await this.prisma.modulePrice.create({ data: { configId: data.configId, moduleKey: data.moduleKey, monthlyCents: monthly, annualCents: annual, billingScope: scope } });
    return ok(row);
  }

  async deleteModulePrice(data: { configId: string; modulePriceId: string }) {
    const { err } = await this.assertDraft(data.configId);
    if (err) return err;
    await this.prisma.modulePrice.deleteMany({ where: { id: data.modulePriceId, configId: data.configId } });
    return ok({ id: data.modulePriceId });
  }

  /** Publish a draft: it becomes the active book; all others deactivate. */
  async publish(data: { configId: string; byUserId?: string }) {
    const cfg = await this.prisma.pricingConfig.findUnique({ where: { id: data.configId } });
    if (!cfg) return fail('Version not found', 404);
    await this.prisma.$transaction([
      this.prisma.pricingConfig.updateMany({ where: { active: true }, data: { active: false } }),
      this.prisma.pricingConfig.update({ where: { id: cfg.id }, data: { active: true } }),
    ]);
    this.logger.warn(`[PLATFORM] pricing v${cfg.version} PUBLISHED by ${data.byUserId ?? 'operator'} (Stripe NOT synced — that's C3)`);
    return ok({ id: cfg.id, version: cfg.version, active: true });
  }
}
