import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CRM_CAPS_SELECT,
  EVENT_PERSON_KEYS,
  REPORT_COPY_INVALID,
  REPORT_HISTORY_MAX,
  crmCapsOfRow,
  crmReachesClient,
  effectiveSpaceModules,
  isAdmin,
  issuerAddressLines,
  parseReportCopy,
  isJobFinished,
  finishedStatusKeys,
  REPORT_NOT_FINISHED,
  REPORT_ISSUER_INVALID,
  COMPANY_UNKNOWN_MESSAGE,
  reportIssuerOptions,
  usableLegalEntityId,
  parseClientCopyInclude,
  REPORT_INCLUDE_INVALID,
  parseStoredStepForm,
  portalRequestReference,
  presentSections,
  resolveInvoiceCurrency,
  resolveIssuerEntityId,
  safeSignatureDataUrl,
  success,
  toClientCopy,
  type StepFormAnswers,
  type TaskReport,
  type TaskReportChecklistItem,
  type TaskReportComment,
  type TaskReportDetail,
  type TaskReportEvent,
  type TaskReportFile,
  type TaskReportHeader,
  type TaskReportIssuer,
  type TaskReportPart,
  type TaskReportPerson,
  type TaskReportPhoto,
  type TaskReportRequest,
  type TaskReportSignature,
  type TaskReportStatus,
  type TaskReportStepSubmission,
  type TaskReportTime,
  type TaskReportWork,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { type TaskAccessFacts } from '../../common/task-access/task-access.service';
import { JobTimeService } from './handover/job-time.service';
import { TaskSupportService } from './task-support.service';
import { TaskQueryService } from './task-query.service';
import { TaskActivityService } from './task-activity.service';
import { TaskChecklistService } from './task-checklist.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { ReportsService } from '../reports/reports.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Exactly what the report renders of the task itself.
 *
 * ⚠️ No rate, no labour cost: `costRateCents`/`billableRateCents` live on the
 * organization, the workspace and the person, and none of them is selected here
 * or anywhere in this file. A report is something a client may be handed.
 */
const REPORT_TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  source: true,
  organizationId: true,
  spaceId: true,
  workflowId: true,
  assignedToId: true,
  openRoleId: true,
  locationAddress: true,
  locationLat: true,
  locationLng: true,
  createdBy: PERSON,
  parent: { select: { id: true, title: true } },
  // `userId` too: the task gate reads it, so asking "is this person on the job?" costs no query.
  assignees: { orderBy: { createdAt: 'asc' }, select: { userId: true, role: true, user: PERSON } },
  customer: {
    select: {
      id: true, name: true, type: true, legalName: true, vatId: true, address: true, email: true, phone: true,
      contactName: true, ownerId: true, managerIds: true, currency: true, legalEntityId: true,
    },
  },
  unit: { select: { id: true, name: true, label: true, address: true, contactName: true, contactPhone: true } },
  asset: {
    select: {
      id: true, name: true, serialNumber: true, model: true, manufacturer: true,
      category: { select: { name: true } }, type: { select: { name: true } },
    },
  },
  space: {
    select: { id: true, name: true, address: true, timezone: true, enabledModules: true, workflowId: true, currency: true, legalEntityId: true },
  },
  organization: {
    select: {
      name: true, enabledModules: true, currency: true, address: true, addressLine1: true, addressLine2: true,
      postalCode: true, city: true, state: true, country: true, vatId: true, email: true, phone: true, website: true, logoUrl: true,
    },
  },
} as const;

/** The issuing company's letterhead fields — never its bank, never its rates. */
const ISSUER_SELECT = {
  id: true, isMain: true, legalName: true, label: true, addressLine1: true, addressLine2: true, postalCode: true, city: true,
  state: true, country: true, vatId: true, taxId: true, registerNumber: true, email: true, phone: true,
  website: true, logoUrl: true, currency: true,
} as const;

/** Events are read newest first, this many per query, up to REPORT_HISTORY_MAX. */
const HISTORY_PAGE = 1000;

type Person = { id: string; firstName: string | null; lastName: string | null };
const personOf = (u: Person | null | undefined): TaskReportPerson | null =>
  u ? { id: u.id, firstName: u.firstName ?? null, lastName: u.lastName ?? null } : null;
const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString());
const nameOf = (p: TaskReportPerson | null) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || null : null);
const isImage = (f: { fileType?: string | null; mimeType?: string | null }) =>
  f.fileType === 'IMAGE' || (typeof f.mimeType === 'string' && f.mimeType.startsWith('image/'));

/**
 * The full report for ONE job (packages/shared/src/tasks/task-report.ts).
 *
 * It COMPOSES what already reads each part of a job — the service report, the
 * checklist, the step submissions, the comments, the attachments, the custom
 * fields, job time — so a section of the report can never say something the job
 * page does not. It owns only what nothing else reads: the header facts, the
 * WHOLE history (the timeline read stops at 100), and the handover notes.
 *
 * ⚠️ ONE access check, the NORMAL one, answered 404. Not the role-holder
 * exemption (someone who may take a job has not done it — the report carries
 * comments, signatures and the service report) and never a cross-org guest: the
 * shared spaces are dropped here even if a caller sends them, because a share
 * has its own switches for reports and this route is not one of them. The
 * composed reads then re-ask the same gate on the same facts, which can only
 * agree.
 */
@Injectable()
export class TaskReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowConfigCache,
    private readonly jobTime: JobTimeService,
    private readonly support: TaskSupportService,
    private readonly query: TaskQueryService,
    private readonly activity: TaskActivityService,
    private readonly checklist: TaskChecklistService,
    private readonly attachments: AttachmentsService,
    private readonly reports: ReportsService,
    private readonly customFields: CustomFieldsService,
  ) {}

  async build(data: TaskAccessFacts & { id: string; copy?: unknown; include?: unknown; issuer?: unknown }) {
    const copy = parseReportCopy(data.copy);
    if (!copy) throw new BadRequestException({ message: 'Choose the office or the client copy.', code: REPORT_COPY_INVALID });
    const include = parseClientCopyInclude(data.include);
    if (!include) throw new BadRequestException({ message: 'Unknown part of the report to add to the client copy.', code: REPORT_INCLUDE_INVALID });

    // Whatever the caller forwarded, this route reads the caller's OWN organization only.
    const facts: TaskAccessFacts = {
      userId: data.userId,
      userRole: data.userRole,
      organizationId: data.organizationId,
      canViewAllTasks: data.canViewAllTasks,
      viewAllSpaceIds: data.viewAllSpaceIds,
      sharedSpaceIds: [],
    };

    const task = await this.prisma.task.findUnique({ where: { id: data.id }, select: REPORT_TASK_SELECT });
    // 404, not 403: a refusal must not confirm that the job exists.
    if (!task || !(await this.support.taskAccess.allows(task, facts))) throw new NotFoundException('Task not found');

    const modules = new Set(effectiveSpaceModules(task.space?.enabledModules, task.organization.enabledModules));
    const on = (m: string) => modules.has(m);
    const byTask = { taskId: task.id, ...facts };

    // ⚠️ A report is of a FINISHED job (the flow's final, non-canceled step).
    // Asked first, from the cached flow, so an unfinished job costs one lookup.
    const workflow = await this.workflows.getWorkflow(task.organizationId, task.workflowId ?? task.space?.workflowId ?? null);
    if (!isJobFinished(task.status, ((workflow?.statuses ?? []) as any[]))) {
      throw new ConflictException({ message: 'The report is ready once the job is finished.', code: REPORT_NOT_FINISHED });
    }

    /*
      ⚠️ "Issued by", chosen per report like an invoice's: the SAME rule a workspace,
      client or member link is saved by (usableLegalEntityId — this organization's
      ACTIVE companies). Anything else is a 400, never a silent fall-back that prints
      a different company than the one chosen. Absent / empty = the automatic rule.
    */
    const chosen = await usableLegalEntityId(this.prisma as any, facts.organizationId, data.issuer);
    if (!chosen.ok) {
      throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: REPORT_ISSUER_INVALID });
    }

    const [
      history, created, time, submissions, checklist, attachments, report, comments, handovers, details, entities, clientShown,
    ] = await Promise.all([
      this.history(task.id),
      // The origin is the FIRST event, which a long history may have cut — asked on its own.
      this.prisma.taskEvent.findFirst({ where: { taskId: task.id, eventType: 'CREATED' }, orderBy: { createdAt: 'asc' }, select: { metadata: true } }),
      this.jobTime.forTask(task),
      this.query.getSubmissions({ id: task.id, ...facts }).then((r) => r.data),
      on('checklists') ? this.checklist.getChecklist(byTask).then((r) => r.data) : null,
      on('attachments') ? this.attachments.findByTask(byTask).then((r) => r.data) : null,
      on('service_reports') ? this.reports.findByTaskId(byTask).then((r) => r.data) : undefined,
      this.activity.getComments(byTask).then((r) => r.data),
      this.prisma.taskHandover.findMany({
        where: { taskId: task.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, note: true, createdAt: true, workedMinutes: true, author: PERSON },
      }),
      on('custom_fields') ? this.customFields.getTaskValues(byTask).then((r) => r.data) : null,
      this.prisma.legalEntity.findMany({ where: { organizationId: task.organizationId, isActive: true }, select: ISSUER_SELECT }),
      this.clientReach(task.customer, facts),
    ]);

    const statuses: TaskReportStatus[] = ((workflow?.statuses ?? []) as any[]).map((s) => ({
      key: s.key, name: s.name, color: s.color ?? null, isFinal: !!s.isFinal, isCanceled: !!s.isCanceled,
    }));

    const steps = this.stepAnswers(submissions as any[]);
    const stepFileIds = new Set(steps.flatMap((s) => s.fields.flatMap((f) => f.files.map((x) => x.id))));
    const taskFiles = ((attachments ?? []) as any[]).filter((a) => !stepFileIds.has(a.id));

    const photos: TaskReportPhoto[] = [];
    const signatures: TaskReportSignature[] = [];
    let work: TaskReportWork | null | undefined;
    let parts: TaskReportPart[] | undefined;

    if (report !== undefined) {
      const r = report as any;
      const by = personOf(r?.completedBy);
      work = r ? { summary: r.summary, workPerformed: r.workPerformed ?? null, customerName: r.customerName ?? null, completedAt: iso(r.completedAt)!, completedBy: by } : null;
      parts = ((r?.partsUsed ?? []) as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        partNumber: p.partNumber ?? null,
        quantity: p.quantity,
        notes: p.notes ?? null,
        unitPrice: p.unitCost ?? null,
        lineTotal: p.unitCost != null ? Math.round(p.quantity * p.unitCost * 100) / 100 : null,
      }));
      for (const a of (r?.attachments ?? []) as any[]) {
        photos.push({ ...this.file(a, by), source: a.type === 'AFTER' ? 'AFTER' : 'BEFORE', caption: a.caption ?? null, statusKey: null, fieldLabel: null });
      }
      /*
        ⚠️ The column is free text. Only a PNG/JPEG data URL is passed on
        (safeSignatureDataUrl) — anything else is dropped, not "cleaned".
      */
      const tech = safeSignatureDataUrl(r?.technicianSignature);
      if (tech) signatures.push({ kind: 'TECHNICIAN', dataUrl: tech, url: null, name: nameOf(by), person: by, signedAt: iso(r.completedAt), statusKey: null, fieldLabel: null });
      const cust = safeSignatureDataUrl(r?.customerSignature);
      if (cust) signatures.push({ kind: 'CUSTOMER', dataUrl: cust, url: null, name: r.customerName ?? null, person: null, signedAt: iso(r.completedAt), statusKey: null, fieldLabel: null });
    }

    for (const a of taskFiles) if (isImage(a)) photos.push({ ...this.file(a, a.uploadedBy), source: 'TASK', caption: null, statusKey: null, fieldLabel: null });
    for (const s of steps) {
      for (const f of s.fields) {
        for (const file of f.files) {
          if (f.type === 'photos') photos.push({ ...file, source: 'STEP', caption: null, statusKey: s.statusKey, fieldLabel: f.label });
          if (f.type === 'signature') {
            signatures.push({ kind: 'STEP', dataUrl: null, url: file.url, name: null, person: s.submittedBy, signedAt: s.submittedAt, statusKey: s.statusKey, fieldLabel: f.label });
          }
        }
      }
    }
    photos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const events = await this.resolveEvents(history.rows);
    // The chosen company must also be one the JOB's organization prints from (same org, read in the same breath).
    if (chosen.id && !entities.some((e) => e.id === chosen.id)) {
      throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: REPORT_ISSUER_INVALID });
    }
    const issuerIds = this.issuerIds(task, entities, chosen.id ?? null);
    const header = this.header(task, statuses, time, events, work, entities, issuerIds.used, clientShown, (workflow as any)?.name ?? null);

    const bundle: TaskReport = {
      meta: {
        copy: 'office', generatedAt: new Date().toISOString(), sections: [], historyTruncated: history.truncated,
        issuers: reportIssuerOptions(entities), issuerId: issuerIds.used, issuerDefaultId: issuerIds.automatic,
      },
      header: await header,
      request: this.request(task, created?.metadata),
      ...(work !== undefined ? { work } : {}),
      time: this.time(time, events),
      photos,
      ...(checklist ? { checklist: (checklist as any[]).map((i) => this.checklistItem(i)) } : {}),
      stepAnswers: steps,
      ...(parts ? { parts } : {}),
      /*
        The route is the GATEWAY's to fill: it is tracking-service's data and
        `canViewTracking` is the gateway's question. A null placeholder says
        "the workspace tracks routes"; the gateway fills it or removes it.
      */
      ...(on('tracking') ? { route: null } : {}),
      history: events,
      comments: ((comments ?? []) as any[])
        .map((c): TaskReportComment => ({ id: c.id, content: c.content, createdAt: iso(c.createdAt)!, author: personOf(c.user) }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      handovers: handovers.map((h) => ({ id: h.id, note: h.note, createdAt: iso(h.createdAt)!, author: personOf(h.author), workedMinutes: h.workedMinutes ?? null })),
      ...(attachments ? { documents: taskFiles.filter((a) => !isImage(a)).map((a) => this.file(a, a.uploadedBy)) } : {}),
      ...(details ? { details: this.details(details as any[]) } : {}),
      signatures,
    };
    bundle.meta.sections = presentSections(bundle);

    // ⚠️ The client copy is cut HERE, before the bundle leaves the service (shared toClientCopy).
    return success(copy === 'client' ? toClientCopy(bundle, include) : bundle);
  }

  // ───────────────────────────── history ─────────────────────────────

  /**
   * The WHOLE history, newest first in pages, up to REPORT_HISTORY_MAX — then
   * turned chronological. A cut keeps the END of the job (how it finished)
   * and says so; years of a daily recurring crew is the only way to reach it.
   */
  private async history(taskId: string): Promise<{ rows: Array<{ id: string; eventType: string; metadata: unknown; createdAt: Date; userId: string }>; truncated: boolean }> {
    const rows: Array<{ id: string; eventType: string; metadata: unknown; createdAt: Date; userId: string }> = [];
    let cursor: string | null = null;
    while (rows.length <= REPORT_HISTORY_MAX) {
      // Internal paging (no client limit to clamp): a page, or what is left under the ceiling + 1.
      const want = Math.min(HISTORY_PAGE, REPORT_HISTORY_MAX + 1 - rows.length);
      const page: typeof rows = await this.prisma.taskEvent.findMany({
        where: { taskId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: want,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, eventType: true, metadata: true, createdAt: true, userId: true },
      });
      rows.push(...page);
      if (page.length < want) break;
      cursor = page[page.length - 1]!.id;
    }
    const truncated = rows.length > REPORT_HISTORY_MAX;
    return { rows: rows.slice(0, REPORT_HISTORY_MAX).reverse(), truncated };
  }

  /** Every person an event names, by name — ONE query for the whole history. */
  private async resolveEvents(rows: Array<{ id: string; eventType: string; metadata: unknown; createdAt: Date; userId: string }>): Promise<TaskReportEvent[]> {
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.userId);
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      for (const k of EVENT_PERSON_KEYS) if (typeof m[k] === 'string' && m[k]) ids.add(m[k] as string);
    }
    const people = ids.size ? await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, ...PERSON }) : [];
    const byId = new Map(people.map((p) => [p.id, personOf(p)!]));
    return rows.map((r) => {
      const data = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
      const refs: Record<string, TaskReportPerson> = {};
      for (const k of EVENT_PERSON_KEYS) {
        const p = typeof data[k] === 'string' ? byId.get(data[k] as string) : undefined;
        if (p) refs[k] = p;
      }
      return { id: r.id, type: r.eventType, at: iso(r.createdAt)!, actor: byId.get(r.userId) ?? null, refs, data };
    });
  }

  // ───────────────────────────── sections ─────────────────────────────

  private async header(
    task: any,
    statuses: TaskReportStatus[],
    time: Awaited<ReturnType<JobTimeService['forTask']>>,
    events: TaskReportEvent[],
    work: TaskReportWork | null | undefined,
    entities: any[],
    issuerId: string | null,
    clientShown: boolean,
    workflowName: string | null,
  ): Promise<TaskReportHeader> {
    const finals = finishedStatusKeys(statuses);
    const moves = events.filter((e) => e.type === 'STATUS_CHANGED');
    const lastFinal = [...moves].reverse().find((e) => finals.has(String(e.data.newStatus)));
    const finishedAt = finals.has(task.status) ? (lastFinal?.at ?? work?.completedAt ?? null) : null;

    const entity = entities.find((e) => e.id === issuerId) ?? null;
    // The LEAD row; a job assigned before crews existed names its lead only on `assignedToId`.
    const lead = (task.assignees.find((a: any) => a.role === 'LEAD') ?? task.assignees.find((a: any) => a.userId === task.assignedToId))?.user ?? null;

    return {
      taskId: task.id,
      reference: portalRequestReference(task.id),
      title: task.title,
      status: task.status,
      priority: task.priority,
      issuer: this.issuer(entity, task.organization),
      client: task.customer ? this.client(task.customer, clientShown) : null,
      contact: await this.contact(task, clientShown),
      site: { address: task.locationAddress ?? null, lat: task.locationLat ?? null, lng: task.locationLng ?? null },
      unit: task.unit ?? null,
      asset: task.asset
        ? {
            id: task.asset.id, name: task.asset.name, serialNumber: task.asset.serialNumber ?? null, model: task.asset.model ?? null,
            manufacturer: task.asset.manufacturer ?? null, category: task.asset.category?.name ?? null, type: task.asset.type?.name ?? null,
          }
        : null,
      workspace: task.space ? { id: task.space.id, name: task.space.name, address: task.space.address ?? null, timezone: task.space.timezone } : null,
      createdAt: iso(task.createdAt)!,
      createdBy: personOf(task.createdBy),
      dueDate: iso(task.dueDate),
      startedAt: time.startedBy?.at ?? moves[0]?.at ?? null,
      startedBy: personOf((time.startedBy as any)?.forUser ?? (time.startedBy as any)?.user) ?? moves[0]?.actor ?? null,
      finishedAt,
      taskType: workflowName,
      totalMinutes: time.total.travel + time.total.working + time.total.blocked,
      lead: personOf(lead),
      crew: task.assignees.map((a: any) => ({ person: personOf(a.user)!, role: a.role === 'LEAD' ? 'LEAD' : 'MEMBER' })),
      statuses,
      currency: resolveInvoiceCurrency({ space: task.space, customer: task.customer, company: entity, organization: task.organization }).currency,
    };
  }

  /**
   * Which company the report is from: the CHOSEN one (already validated), else the
   * invoice rule — workspace → client → main. `automatic` is what the rule alone
   * picks, so the picker can say which company "automatic" means.
   */
  private issuerIds(task: any, entities: any[], chosen: string | null): { used: string | null; automatic: string | null } {
    const main = entities.find((e) => e.isMain)?.id ?? null;
    const active = new Set<string>(entities.map((e) => e.id));
    const levels = { workspace: task.space?.legalEntityId, client: task.customer?.legalEntityId };
    return {
      used: resolveIssuerEntityId({ invoice: chosen, ...levels }, main, active),
      automatic: resolveIssuerEntityId(levels, main, active),
    };
  }

  /** The issuing company (invoice rule: workspace → client → main), else the organization profile. */
  private issuer(entity: any, org: any): TaskReportIssuer {
    if (entity) {
      return {
        name: entity.legalName, logoUrl: entity.logoUrl ?? org.logoUrl ?? null, addressLines: issuerAddressLines(entity),
        vatId: entity.vatId ?? null, taxId: entity.taxId ?? null, registerNumber: entity.registerNumber ?? null,
        email: entity.email ?? null, phone: entity.phone ?? null, website: entity.website ?? null,
      };
    }
    const lines = issuerAddressLines(org);
    return {
      name: org.name, logoUrl: org.logoUrl ?? null, addressLines: lines.length ? lines : org.address ? [org.address] : [],
      vatId: org.vatId ?? null, taxId: null, registerNumber: null, email: org.email ?? null, phone: org.phone ?? null, website: org.website ?? null,
    };
  }

  /**
   * May this reader open the job's client in the CRM? The CRM's own reach rule
   * (crm/client-reach.ts), as the calendar asks it. The NAME is the job's and is
   * always shown; the record's details only to somebody who reaches it.
   */
  private async clientReach(customer: { ownerId: string | null; managerIds: string[] } | null, facts: TaskAccessFacts): Promise<boolean> {
    if (!customer) return false;
    if (isAdmin({ role: facts.userRole })) return true;
    const row = await this.prisma.user.findFirst({ where: { id: facts.userId, organizationId: facts.organizationId }, select: CRM_CAPS_SELECT });
    return crmReachesClient(crmCapsOfRow(row), customer, facts.userId);
  }

  private client(c: any, shown: boolean) {
    return {
      id: c.id, name: c.name, type: c.type, restricted: !shown,
      legalName: shown ? (c.legalName ?? null) : null,
      vatId: shown ? (c.vatId ?? null) : null,
      address: shown ? (c.address ?? null) : null,
      email: shown ? (c.email ?? null) : null,
      phone: shown ? (c.phone ?? null) : null,
    };
  }

  /** The client's primary contact person (CRM), else the site's own contact, else the client's contact name. */
  private async contact(task: any, clientShown: boolean) {
    if (clientShown && task.customer) {
      const primary = await this.prisma.customerContact.findFirst({
        where: { companyId: task.customer.id, isPrimary: true },
        select: { role: true, person: { select: { name: true, phone: true, email: true } } },
      });
      if (primary) return { name: primary.person.name, role: primary.role ?? null, phone: primary.person.phone ?? null, email: primary.person.email ?? null };
    }
    if (task.unit?.contactName || task.unit?.contactPhone) {
      return { name: task.unit.contactName ?? null, role: null, phone: task.unit.contactPhone ?? null, email: null };
    }
    if (clientShown && task.customer?.contactName) return { name: task.customer.contactName, role: null, phone: null, email: null };
    return null;
  }

  private request(task: any, created: unknown): TaskReportRequest {
    const m = (created ?? {}) as { source?: string; templateId?: string; templateTitle?: string };
    const kind = task.source === 'CUSTOMER_PORTAL'
      ? 'CUSTOMER_PORTAL'
      : m.source === 'recurring_template'
        ? 'RECURRING'
        : task.parent
          ? 'SUBTASK'
          : 'INTERNAL';
    return {
      description: task.description ?? null,
      origin: {
        kind,
        portalReference: kind === 'CUSTOMER_PORTAL' ? portalRequestReference(task.id) : null,
        recurringTemplate: kind === 'RECURRING' ? { id: m.templateId ?? null, title: m.templateTitle ?? null } : null,
        parent: task.parent ?? null,
      },
    };
  }

  /** Job time as the job page reads it (JobTimeService), plus each person's own stops from the history. */
  private time(time: Awaited<ReturnType<JobTimeService['forTask']>>, events: TaskReportEvent[]): TaskReportTime {
    const ownStops: NonNullable<TaskReportTime['ownStops']> = [];
    const open = new Map<string, number>();
    for (const e of events) {
      const who = e.actor?.id;
      if (!who) continue;
      if (e.type === 'SELF_BLOCKED') {
        open.set(who, ownStops.length);
        ownStops.push({ person: e.actor, at: e.at, reason: typeof e.data.reason === 'string' ? e.data.reason : null, resumedAt: null });
      } else if (e.type === 'SELF_RESUMED' && open.has(who)) {
        ownStops[open.get(who)!]!.resumedAt = e.at;
        open.delete(who);
      }
    }
    return {
      asOf: time.asOf,
      total: time.total,
      byPerson: time.byWorker.map((w) => ({ person: personOf(w.user)!, travel: w.travel, working: w.working, blocked: w.blocked })),
      ownStops,
    };
  }

  private checklistItem(i: any): TaskReportChecklistItem {
    return {
      id: i.id, text: i.text, isCompleted: !!i.isCompleted,
      owner: personOf(i.assignee), completedBy: personOf(i.completedBy), completedAt: iso(i.completedAt),
    };
  }

  /**
   * Step answers with their form's LABELS (the snapshot the person answered).
   * A photo or signature answer keeps only the files getSubmissions resolved —
   * which are this job's own (it scopes the lookup to the task). A stored id
   * that names anything else is dropped from the value too, not just unlinked.
   */
  private stepAnswers(rows: any[]): TaskReportStepSubmission[] {
    return rows.map((r) => {
      const form = parseStoredStepForm(r.form);
      const answers = (r.answers ?? {}) as StepFormAnswers;
      const files = (r.files ?? {}) as Record<string, any>;
      const by = personOf(r.submittedBy);
      return {
        id: r.id,
        statusKey: r.statusKey,
        submittedAt: iso(r.submittedAt)!,
        submittedBy: by,
        fields: (form?.fields ?? []).map((f) => {
          const raw = answers[f.id];
          if (f.type === 'photos' || f.type === 'signature') {
            const ids = (Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []).filter((id) => files[id]);
            return {
              id: f.id, label: f.label, type: f.type,
              value: f.type === 'photos' ? ids : (ids[0] ?? null),
              files: ids.map((id) => ({ ...this.file(files[id], by), createdAt: iso(files[id].createdAt ?? r.submittedAt)! })),
            };
          }
          return { id: f.id, label: f.label, type: f.type, value: raw ?? null, files: [] };
        }),
      };
    });
  }

  private details(rows: any[]): TaskReportDetail[] {
    return rows
      .filter((v) => typeof v.value === 'string' && v.value.trim() !== '')
      .map((v) => ({ id: v.definitionId, name: v.definition?.name ?? '', key: v.definition?.key ?? '', type: v.definition?.type ?? 'TEXT', value: v.value }));
  }

  /** A signed file row, as the report shows it — never the stored provider URL or key. */
  private file(f: any, by: Person | null | undefined): TaskReportFile {
    return {
      id: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType ?? null,
      fileSize: f.fileSize ?? null,
      url: f.url ?? null,
      createdAt: iso(f.createdAt) ?? new Date(0).toISOString(),
      by: personOf(by),
    };
  }
}
