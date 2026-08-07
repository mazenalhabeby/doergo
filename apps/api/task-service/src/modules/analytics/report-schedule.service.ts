import {
  Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES } from '@hbcfield/shared';
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
      include: { reportDefinition: true },
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

  private async deliver(schedule: { organizationId: string; recipients: string[]; reportDefinition: { name: string; config: unknown } }) {
    const recipients = (schedule.recipients || []).filter(Boolean);
    if (!recipients.length) return;
    const def = schedule.reportDefinition.config as ReportDefinition;
    const { data } = await this.analytics.run({ organizationId: schedule.organizationId, definition: def });
    const html = this.renderHtml(schedule.reportDefinition.name, data.columns, data.rows);
    this.notificationClient.emit('report_email', {
      recipients,
      subject: `Report: ${schedule.reportDefinition.name}`,
      html,
    });
  }

  /** Escape a string for safe interpolation into report-email HTML (L5). */
  private esc(v: unknown): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private fmt(v: unknown, format?: string): string {
    if (v == null) return '—';
    if (format === 'hours') return `${Number(v).toFixed(1)}h`;
    if (format === 'currency') return `€${Number(v).toFixed(2)}`;
    if (format === 'percent') return `${Number(v)}%`;
    if (format === 'number') return Number(v).toLocaleString();
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  private renderHtml(name: string, columns: Array<{ key: string; label: string; kind: string; format?: string }>, rows: Array<Record<string, unknown>>): string {
    const th = columns.map((c) => `<th style="text-align:${c.kind === 'measure' ? 'right' : 'left'};padding:8px 12px;border-bottom:2px solid #e2e8f0;font-size:12px;color:#64748b;text-transform:uppercase;">${this.esc(c.label)}</th>`).join('');
    const trs = rows.slice(0, 200).map((r) => {
      const tds = columns.map((c) => `<td style="text-align:${c.kind === 'measure' ? 'right' : 'left'};padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;">${this.esc(this.fmt(r[c.key], c.format))}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `
      <div style="font-family:Inter,system-ui,sans-serif;color:#1e293b;">
        <h2 style="margin:0 0 4px;">${this.esc(name)}</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:13px;">Generated ${new Date().toUTCString()}</p>
        ${rows.length === 0 ? '<p style="color:#64748b;">No data for this period.</p>' : `<table style="border-collapse:collapse;width:100%;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`}
        <p style="margin-top:20px;color:#94a3b8;font-size:12px;">HBCField — scheduled report</p>
      </div>`;
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
