import {
  Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  SERVICE_NAMES,
  emailLocale,
  formatNumberFor,
  groupByLocale,
  localesByAddress,
  reportLabel,
  scheduledReportEmail,
  type SupportedLocale,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AnalyticsService } from './analytics.service';
import { ReportDefinition } from './query-engine';

type Cadence = 'daily' | 'weekly' | 'monthly';

interface ScheduleInput {
  cadence: Cadence;
  hour?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients: string[];
  isActive?: boolean;
}

@Injectable()
export class ReportScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportScheduleService.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_INTERVAL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  onModuleInit() {
    this.pollTimer = setInterval(() => {
      this.runDue().catch((e) => this.logger.error(`Report scheduler error: ${e}`));
    }, this.POLL_INTERVAL_MS);
    this.logger.log('Report delivery scheduler started (every 5 min)');
    setTimeout(() => this.runDue().catch((e) => this.logger.error(`Report scheduler error: ${e}`)), 20_000);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  /** Next UTC run time for a cadence, strictly after `from`. */
  computeNextRun(cadence: Cadence, hour: number, dayOfWeek: number | null | undefined, dayOfMonth: number | null | undefined, from = new Date()): Date {
    const h = Math.min(Math.max(hour ?? 7, 0), 23);
    const d = new Date(from);
    d.setUTCHours(h, 0, 0, 0);
    if (cadence === 'daily') {
      if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
    } else if (cadence === 'weekly') {
      const target = ((dayOfWeek ?? 1) % 7 + 7) % 7;
      let guard = 0;
      while ((d.getUTCDay() !== target || d <= from) && guard < 8) { d.setUTCDate(d.getUTCDate() + 1); guard++; }
    } else {
      const dom = Math.min(Math.max(dayOfMonth ?? 1, 1), 28);
      d.setUTCDate(dom);
      if (d <= from) { d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(dom); }
    }
    return d;
  }

  // ── Poller ──────────────────────────────────────────────────────────────────
  async runDue() {
    const now = new Date();
    const due = await this.prisma.reportSchedule.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
      take: 25,
      include: { reportDefinition: true, createdBy: { select: { locale: true } } },
    });
    for (const s of due) {
      const next = this.computeNextRun(s.cadence as Cadence, s.hour, s.dayOfWeek, s.dayOfMonth, now);
      // Optimistic claim — only one worker advances this schedule this tick.
      const claim = await this.prisma.reportSchedule.updateMany({
        where: { id: s.id, nextRunAt: s.nextRunAt },
        data: { nextRunAt: next, lastRunAt: now },
      });
      if (claim.count === 0) continue;
      try {
        await this.deliver(s);
      } catch (e) {
        this.logger.error(`Failed to deliver scheduled report ${s.id}: ${e}`);
      }
    }
  }

  /**
   * One email per language among the recipients, not one for everybody.
   *
   * Recipients are ADDRESSES typed into the schedule. Each is written in the
   * language of the account behind it when there is one, and otherwise in the
   * language of the member who set the schedule up — they chose to send this
   * report to that address. One query for the whole list; the report itself is
   * run once, and only the frame around it is rendered per language.
   *
   * Column NAMES are the system's own and are written in each group's language
   * (REPORT_LABELS, the catalogue the web table reads). The VALUES — a person, a
   * client, a status an organization named — are data and go as they are.
   */
  private async deliver(schedule: {
    organizationId: string;
    recipients: string[];
    reportDefinition: { name: string; config: unknown };
    createdBy?: { locale: string | null } | null;
  }) {
    const recipients = [...new Set((schedule.recipients || []).filter(Boolean))];
    if (!recipients.length) return;
    const def = schedule.reportDefinition.config as ReportDefinition;
    const { data } = await this.analytics.run({ organizationId: schedule.organizationId, definition: def });

    const own = await localesByAddress(this.prisma, recipients).catch((e) => {
      this.logger.warn(`Could not look up recipient languages for a report: ${e}`);
      return new Map<string, SupportedLocale>();
    });
    const fallback = emailLocale(schedule.createdBy?.locale);
    const groups = groupByLocale(recipients, (to) => own.get(to.trim().toLowerCase()) ?? fallback);
    const generatedAt = new Date();

    for (const [locale, group] of groups) {
      const { subject, html } = scheduledReportEmail(locale, {
        reportName: schedule.reportDefinition.name,
        generatedAt,
        columns: data.columns.map((c) => ({ label: reportLabel(locale, c.labelKey, c.label), align: c.kind === 'measure' ? 'right' : 'left' })),
        rows: data.rows.slice(0, 200).map((r) => data.columns.map((c) => this.fmt(r[c.key], c.format, locale))),
      });
      this.notificationClient.emit('report_email', { recipients: group, subject, html });
    }
  }

  private fmt(v: unknown, format: string | undefined, locale: SupportedLocale): string {
    if (v == null) return '—';
    if (format === 'hours') return `${formatNumberFor(locale, Number(v), 1)}h`;
    if (format === 'currency') return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(Number(v));
    if (format === 'percent') return `${formatNumberFor(locale, Number(v), 2)}%`;
    if (format === 'number') return formatNumberFor(locale, Number(v), 2);
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────
  async list(data: { organizationId: string; reportDefinitionId?: string }) {
    const items = await this.prisma.reportSchedule.findMany({
      where: { organizationId: data.organizationId, ...(data.reportDefinitionId ? { reportDefinitionId: data.reportDefinitionId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return { data: items };
  }

  async create(data: { organizationId: string; userId: string; reportDefinitionId: string } & ScheduleInput) {
    const report = await this.prisma.reportDefinition.findFirst({
      where: { id: data.reportDefinitionId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (!['daily', 'weekly', 'monthly'].includes(data.cadence)) throw new BadRequestException('Invalid cadence');
    if (!(data.recipients || []).filter(Boolean).length) throw new BadRequestException('At least one recipient is required');
    const nextRunAt = this.computeNextRun(data.cadence, data.hour ?? 7, data.dayOfWeek, data.dayOfMonth);
    const item = await this.prisma.reportSchedule.create({
      data: {
        organizationId: data.organizationId,
        reportDefinitionId: data.reportDefinitionId,
        cadence: data.cadence,
        hour: data.hour ?? 7,
        dayOfWeek: data.dayOfWeek ?? null,
        dayOfMonth: data.dayOfMonth ?? null,
        recipients: data.recipients.filter(Boolean),
        isActive: data.isActive ?? true,
        nextRunAt,
        createdById: data.userId,
      },
    });
    return { data: item };
  }

  async update(data: { id: string; organizationId: string } & Partial<ScheduleInput>) {
    const existing = await this.prisma.reportSchedule.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!existing) throw new NotFoundException('Schedule not found');
    const patch: Record<string, unknown> = {};
    if (data.cadence !== undefined) patch.cadence = data.cadence;
    if (data.hour !== undefined) patch.hour = data.hour;
    if (data.dayOfWeek !== undefined) patch.dayOfWeek = data.dayOfWeek;
    if (data.dayOfMonth !== undefined) patch.dayOfMonth = data.dayOfMonth;
    if (data.recipients !== undefined) patch.recipients = data.recipients.filter(Boolean);
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    // Recompute next run when the cadence/time changed.
    if (['cadence', 'hour', 'dayOfWeek', 'dayOfMonth'].some((k) => k in patch)) {
      patch.nextRunAt = this.computeNextRun(
        (patch.cadence as Cadence) ?? (existing.cadence as Cadence),
        (patch.hour as number) ?? existing.hour,
        (patch.dayOfWeek as number) ?? existing.dayOfWeek,
        (patch.dayOfMonth as number) ?? existing.dayOfMonth,
      );
    }
    const item = await this.prisma.reportSchedule.update({ where: { id: data.id }, data: patch });
    return { data: item };
  }

  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.reportSchedule.findFirst({ where: { id: data.id, organizationId: data.organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Schedule not found');
    await this.prisma.reportSchedule.delete({ where: { id: data.id } });
    return { success: true };
  }
}
