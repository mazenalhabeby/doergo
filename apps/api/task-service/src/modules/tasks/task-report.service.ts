import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  REPORT_COPY_INVALID,
  effectiveSpaceModules,
  parseReportCopy,
  isJobFinished,
  REPORT_NOT_FINISHED,
  REPORT_ISSUER_INVALID,
  COMPANY_UNKNOWN_MESSAGE,
  reportIssuerOptions,
  usableLegalEntityId,
  parseClientCopyInclude,
  REPORT_INCLUDE_INVALID,
  presentSections,
  safeSignatureDataUrl,
  success,
  toClientCopy,
  type TaskReport,
  type TaskReportComment,
  type TaskReportPart,
  type TaskReportPhoto,
  type TaskReportSignature,
  type TaskReportStatus,
  type TaskReportWork,
} from '@hbcfield/shared';
import { type TaskAccessFacts } from '../../common/task-access/task-access.service';
import { PERSON, REPORT_TASK_SELECT, ISSUER_SELECT, personOf, iso, nameOf, isImage } from './task-report-helpers';
import { TaskReportSections } from './task-report-sections';

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
export class TaskReportService extends TaskReportSections {
  async build(data: TaskAccessFacts & { id: string; copy?: unknown; include?: unknown; issuer?: unknown }) {
    const copy = parseReportCopy(data.copy);
    if (!copy) throw new BadRequestException({ message: 'Choose the office or the client copy.', code: REPORT_COPY_INVALID });
    const include = parseClientCopyInclude(data.include);
    if (!include)
      throw new BadRequestException({
        message: 'Unknown part of the report to add to the client copy.',
        code: REPORT_INCLUDE_INVALID,
      });

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
    if (!isJobFinished(task.status, (workflow?.statuses ?? []))) {
      throw new ConflictException({ message: 'The report is ready once the job is finished.', code: REPORT_NOT_FINISHED });
    }

    /*
      ⚠️ "Issued by", chosen per report like an invoice's: the SAME rule a workspace,
      client or member link is saved by (usableLegalEntityId — this organization's
      ACTIVE companies). Anything else is a 400, never a silent fall-back that prints
      a different company than the one chosen. Absent / empty = the automatic rule.
    */
    const chosen = await usableLegalEntityId(this.prisma, facts.organizationId, data.issuer);
    if (!chosen.ok) {
      throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: REPORT_ISSUER_INVALID });
    }

    const [
      history, created, time, submissions, checklist, attachments, report, comments, handovers, details, entities, clientShown,
    ] = await Promise.all([
      this.history(task.id),
      // The origin is the FIRST event, which a long history may have cut — asked on its own.
      this.prisma.taskEvent.findFirst({
        where: { taskId: task.id, eventType: 'CREATED' },
        orderBy: { createdAt: 'asc' },
        select: { metadata: true },
      }),
      this.jobTime.forTask(task),
      this.query.getSubmissions({ id: task.id, ...facts }).then((r) => r.data),
      on('checklists') ? this.checklist.getChecklist(byTask).then((r) => r.data) : null,
      on('attachments') ? this.attachments.findByTask(byTask).then((r) => r.data) : null,
      on('service_reports') ? this.reportRead.findByTaskId(byTask).then((r) => r.data) : undefined,
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

    const statuses: TaskReportStatus[] = (workflow?.statuses ?? []).map((s) => ({
      key: s.key, name: s.name, color: s.color ?? null, isFinal: !!s.isFinal, isCanceled: !!s.isCanceled,
    }));

    // getSubmissions always answers data for a task the gate let through (it threw otherwise).
    const steps = this.stepAnswers(submissions!);
    const stepFileIds = new Set(steps.flatMap((s) => s.fields.flatMap((f) => f.files.map((x) => x.id))));
    const taskFiles = (attachments ?? []).filter((a) => !stepFileIds.has(a.id));

    const photos: TaskReportPhoto[] = [];
    const signatures: TaskReportSignature[] = [];
    let work: TaskReportWork | null | undefined;
    let parts: TaskReportPart[] | undefined;

    if (report !== undefined) {
      const r = report;
      const by = personOf(r?.completedBy);
      work = r
        ? {
            summary: r.summary,
            workPerformed: r.workPerformed ?? null,
            customerName: r.customerName ?? null,
            completedAt: iso(r.completedAt)!,
            completedBy: by,
          }
        : null;
      parts = (r?.partsUsed ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        partNumber: p.partNumber ?? null,
        quantity: p.quantity,
        notes: p.notes ?? null,
        unitPrice: p.unitCost ?? null,
        lineTotal: p.unitCost != null ? Math.round(p.quantity * p.unitCost * 100) / 100 : null,
      }));
      for (const a of (r?.attachments ?? [])) {
        photos.push({
          ...this.file(a, by),
          source: a.type === 'AFTER' ? 'AFTER' : 'BEFORE',
          caption: a.caption ?? null,
          statusKey: null,
          fieldLabel: null,
        });
      }
      /*
        ⚠️ The column is free text. Only a PNG/JPEG data URL is passed on
        (safeSignatureDataUrl) — anything else is dropped, not "cleaned".
      */
      const tech = safeSignatureDataUrl(r?.technicianSignature);
      if (tech)
        signatures.push({
          kind: 'TECHNICIAN',
          dataUrl: tech,
          url: null,
          name: nameOf(by),
          person: by,
          signedAt: iso(r?.completedAt),
          statusKey: null,
          fieldLabel: null,
        });
      const cust = safeSignatureDataUrl(r?.customerSignature);
      if (cust)
        signatures.push({
          kind: 'CUSTOMER',
          dataUrl: cust,
          url: null,
          name: r?.customerName ?? null,
          person: null,
          signedAt: iso(r?.completedAt),
          statusKey: null,
          fieldLabel: null,
        });
    }

    for (const a of taskFiles)
      if (isImage(a))
        photos.push({
          ...this.file(a, a.uploadedBy),
          source: 'TASK',
          caption: null,
          statusKey: null,
          fieldLabel: null,
        });
    for (const s of steps) {
      for (const f of s.fields) {
        for (const file of f.files) {
          if (f.type === 'photos') photos.push({ ...file, source: 'STEP', caption: null, statusKey: s.statusKey, fieldLabel: f.label });
          if (f.type === 'signature') {
            signatures.push({
              kind: 'STEP',
              dataUrl: null,
              url: file.url,
              name: null,
              person: s.submittedBy,
              signedAt: s.submittedAt,
              statusKey: s.statusKey,
              fieldLabel: f.label,
            });
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
    const header = this.header(task, statuses, time, events, work, entities, issuerIds.used, clientShown, workflow?.name ?? null);

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
      ...(checklist ? { checklist: checklist.map((i) => this.checklistItem(i)) } : {}),
      stepAnswers: steps,
      ...(parts ? { parts } : {}),
      /*
        The route is the GATEWAY's to fill: it is tracking-service's data and
        `canViewTracking` is the gateway's question. A null placeholder says
        "the workspace tracks routes"; the gateway fills it or removes it.
      */
      ...(on('tracking') ? { route: null } : {}),
      history: events,
      comments: (comments ?? [])
        .map((c): TaskReportComment => ({ id: c.id, content: c.content, createdAt: iso(c.createdAt)!, author: personOf(c.user) }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      handovers: handovers.map((h) => ({
        id: h.id,
        note: h.note,
        createdAt: iso(h.createdAt)!,
        author: personOf(h.author),
        workedMinutes: h.workedMinutes ?? null,
      })),
      ...(attachments
        ? { documents: taskFiles.filter((a) => !isImage(a)).map((a) => this.file(a, a.uploadedBy)) }
        : {}),
      ...(details ? { details: this.details(details) } : {}),
      signatures,
    };
    bundle.meta.sections = presentSections(bundle);

    // ⚠️ The client copy is cut HERE, before the bundle leaves the service (shared toClientCopy).
    return success(copy === 'client' ? toClientCopy(bundle, include) : bundle);
  }
}
