import { Injectable } from '@nestjs/common';
import {
  crmReachOfRow,
  crmReachesClientIn,
  isAdmin,
  issuerAddressLines,
  finishedStatusKeys,
  portalRequestReference,
  resolveInvoiceCurrency,
  resolveIssuerEntityId,
  type TaskReportEvent,
  type TaskReportHeader,
  type TaskReportIssuer,
  type TaskReportStatus,
  type TaskReportWork,
  primaryContactOf,
  personCrmReach,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { type TaskAccessFacts } from '../access/task-access.service';
import { JobTimeService } from '../handover/job-time.service';
import { TaskSupportService } from '../core/task-support.service';
import { TaskQueryService } from '../query/task-query.service';
import { TaskActivityService } from '../query/task-activity.service';
import { TaskChecklistService } from '../checklist/task-checklist.service';
import { AttachmentsService } from '../../attachments/attachments.service';
import { CustomFieldsService } from '../../custom-fields/custom-fields.service';
import { ReportReadService } from '../../reports/report-read.service';
import { personOf, iso, type ReportTask, type ReportIssuerRow } from './task-report-helpers';

/**
 * The job report's parties: who issues it (the company), the client and their
 * contact, and whether the reader's CRM reaches them.
 */
@Injectable()
export abstract class TaskReportParties {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly workflows: WorkflowConfigCache,
    protected readonly jobTime: JobTimeService,
    protected readonly support: TaskSupportService,
    protected readonly query: TaskQueryService,
    protected readonly activity: TaskActivityService,
    protected readonly checklist: TaskChecklistService,
    protected readonly attachments: AttachmentsService,
    protected readonly reportRead: ReportReadService,
    protected readonly customFields: CustomFieldsService,
  ) {}

  // ───────────────────────────── sections ─────────────────────────────

  protected async header(
    task: ReportTask,
    statuses: TaskReportStatus[],
    time: Awaited<ReturnType<JobTimeService['forTask']>>,
    events: TaskReportEvent[],
    work: TaskReportWork | null | undefined,
    entities: ReportIssuerRow[],
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
    const lead =
      (task.assignees.find((a) => a.role === 'LEAD') ?? task.assignees.find((a) => a.userId === task.assignedToId))
        ?.user ?? null;

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
            id: task.asset.id,
            name: task.asset.name,
            serialNumber: task.asset.serialNumber ?? null,
            model: task.asset.model ?? null,
            manufacturer: task.asset.manufacturer ?? null,
            category: task.asset.category?.name ?? null,
            type: task.asset.type?.name ?? null,
          }
        : null,
      workspace: task.space
        ? {
            id: task.space.id,
            name: task.space.name,
            address: task.space.address ?? null,
            timezone: task.space.timezone,
          }
        : null,
      createdAt: iso(task.createdAt)!,
      createdBy: personOf(task.createdBy),
      dueDate: iso(task.dueDate),
      startedAt: time.startedBy?.at ?? moves[0]?.at ?? null,
      startedBy: personOf(time.startedBy?.forUser ?? time.startedBy?.user) ?? moves[0]?.actor ?? null,
      finishedAt,
      taskType: workflowName,
      totalMinutes: time.total.travel + time.total.working + time.total.blocked,
      lead: personOf(lead),
      crew: task.assignees.map((a) => ({
        person: personOf(a.user)!,
        role: a.role === 'LEAD' ? 'LEAD' : 'MEMBER',
      })),
      statuses,
      currency: resolveInvoiceCurrency({
        space: task.space,
        customer: task.customer,
        company: entity,
        organization: task.organization,
      }).currency,
    };
  }

  /**
   * Which company the report is from: the CHOSEN one (already validated), else the
   * invoice rule — workspace → client → main. `automatic` is what the rule alone
   * picks, so the picker can say which company "automatic" means.
   */
  protected issuerIds(
    task: ReportTask,
    entities: ReportIssuerRow[],
    chosen: string | null,
  ): { used: string | null; automatic: string | null } {
    const main = entities.find((e) => e.isMain)?.id ?? null;
    const active = new Set<string>(entities.map((e) => e.id));
    const levels = { workspace: task.space?.legalEntityId, client: task.customer?.legalEntityId };
    return {
      used: resolveIssuerEntityId({ invoice: chosen, ...levels }, main, active),
      automatic: resolveIssuerEntityId(levels, main, active),
    };
  }

  /** The issuing company (invoice rule: workspace → client → main), else the organization profile. */
  protected issuer(entity: ReportIssuerRow | null, org: ReportTask['organization']): TaskReportIssuer {
    if (entity) {
      return {
        name: entity.legalName,
        logoUrl: entity.logoUrl ?? org.logoUrl ?? null,
        addressLines: issuerAddressLines(entity),
        vatId: entity.vatId ?? null,
        taxId: entity.taxId ?? null,
        registerNumber: entity.registerNumber ?? null,
        email: entity.email ?? null,
        phone: entity.phone ?? null,
        website: entity.website ?? null,
      };
    }
    const lines = issuerAddressLines(org);
    return {
      name: org.name,
      logoUrl: org.logoUrl ?? null,
      addressLines: lines.length ? lines : org.address ? [org.address] : [],
      vatId: org.vatId ?? null,
      taxId: null,
      registerNumber: null,
      email: org.email ?? null,
      phone: org.phone ?? null,
      website: org.website ?? null,
    };
  }

  /**
   * May this reader open the job's client in the CRM? The CRM's own reach rule
   * (crm/client-reach.ts + crm-reach.ts), as the calendar asks it — org-wide,
   * or a CRM grant in the workspace the client is filed in. The NAME is the
   * job's and is always shown; the record's details only to somebody who
   * reaches it.
   */
  protected async clientReach(
    customer: { spaceId?: string | null; ownerId: string | null; managerIds: string[] } | null,
    facts: TaskAccessFacts,
  ): Promise<boolean> {
    if (!customer) return false;
    if (isAdmin({ role: facts.userRole })) return true;
    const row = await personCrmReach(this.prisma, facts.userId, facts.organizationId);
    return crmReachesClientIn(crmReachOfRow(row as never), customer, facts.userId);
  }

  protected client(c: NonNullable<ReportTask['customer']>, shown: boolean) {
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      restricted: !shown,
      legalName: shown ? (c.legalName ?? null) : null,
      vatId: shown ? (c.vatId ?? null) : null,
      address: shown ? (c.address ?? null) : null,
      email: shown ? (c.email ?? null) : null,
      phone: shown ? (c.phone ?? null) : null,
    };
  }

  /** The client's primary contact person (CRM), else the site's own contact, else the client's contact name. */
  protected async contact(task: ReportTask, clientShown: boolean) {
    if (clientShown && task.customer) {
      const primary = await primaryContactOf(this.prisma, task.customer.id);
      if (primary)
        return {
          name: primary.person.name,
          role: primary.role ?? null,
          phone: primary.person.phone ?? null,
          email: primary.person.email ?? null,
        };
    }
    if (task.unit?.contactName || task.unit?.contactPhone) {
      return { name: task.unit.contactName ?? null, role: null, phone: task.unit.contactPhone ?? null, email: null };
    }
    if (clientShown && task.customer?.contactName)
      return { name: task.customer.contactName, role: null, phone: null, email: null };
    return null;
  }
}
