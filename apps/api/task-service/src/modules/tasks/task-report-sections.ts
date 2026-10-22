import { Injectable } from '@nestjs/common';
import {
  EVENT_PERSON_KEYS,
  REPORT_HISTORY_MAX,
  parseStoredStepForm,
  portalRequestReference,
  type StepFormAnswers,
  type TaskReportChecklistItem,
  type TaskReportDetail,
  type TaskReportEvent,
  type TaskReportFile,
  type TaskReportPerson,
  type TaskReportRequest,
  type TaskReportStepSubmission,
  type TaskReportTime,
  peopleNames,
} from '@hbcfield/shared';
import { JobTimeService } from './handover/job-time.service';
import { HISTORY_PAGE, Person, personOf, iso } from './task-report-helpers';
import type {
  ReportTask,
  ReportFileRow,
  ReportChecklistRow,
  ReportSubmissionRow,
  ReportDetailRow,
} from './task-report-helpers';
import { TaskReportParties } from './task-report-parties';

/**
 * The job report's sections, each read on its own: header (issuer, client,
 * contact), request, time, checklist, step answers, details, files, history.
 */
@Injectable()
export abstract class TaskReportSections extends TaskReportParties {
  // ───────────────────────────── history ─────────────────────────────

  /**
   * The WHOLE history, newest first in pages, up to REPORT_HISTORY_MAX — then
   * turned chronological. A cut keeps the END of the job (how it finished)
   * and says so; years of a daily recurring crew is the only way to reach it.
   */
  protected async history(taskId: string): Promise<{
    rows: Array<{ id: string; eventType: string; metadata: unknown; createdAt: Date; userId: string }>;
    truncated: boolean;
  }> {
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
  protected async resolveEvents(
    rows: Array<{ id: string; eventType: string; metadata: unknown; createdAt: Date; userId: string }>,
  ): Promise<TaskReportEvent[]> {
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.userId);
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      for (const k of EVENT_PERSON_KEYS) if (typeof m[k] === 'string' && m[k]) ids.add(m[k] as string);
    }
    const people = ids.size ? await peopleNames(this.prisma, [...ids]) : [];
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

  protected request(task: ReportTask, created: unknown): TaskReportRequest {
    const m = (created ?? {}) as { source?: string; templateId?: string; templateTitle?: string };
    const kind =
      task.source === 'CUSTOMER_PORTAL'
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
  protected time(time: Awaited<ReturnType<JobTimeService['forTask']>>, events: TaskReportEvent[]): TaskReportTime {
    const ownStops: NonNullable<TaskReportTime['ownStops']> = [];
    const open = new Map<string, number>();
    for (const e of events) {
      const who = e.actor?.id;
      if (!who) continue;
      if (e.type === 'SELF_BLOCKED') {
        open.set(who, ownStops.length);
        ownStops.push({
          person: e.actor,
          at: e.at,
          reason: typeof e.data.reason === 'string' ? e.data.reason : null,
          resumedAt: null,
        });
      } else if (e.type === 'SELF_RESUMED' && open.has(who)) {
        ownStops[open.get(who)!]!.resumedAt = e.at;
        open.delete(who);
      }
    }
    return {
      asOf: time.asOf,
      total: time.total,
      byPerson: time.byWorker.map((w) => ({
        person: personOf(w.user)!,
        travel: w.travel,
        working: w.working,
        blocked: w.blocked,
      })),
      ownStops,
    };
  }

  protected checklistItem(i: ReportChecklistRow): TaskReportChecklistItem {
    return {
      id: i.id,
      text: i.text,
      isCompleted: !!i.isCompleted,
      owner: personOf(i.assignee),
      completedBy: personOf(i.completedBy),
      completedAt: iso(i.completedAt),
    };
  }

  /**
   * Step answers with their form's LABELS (the snapshot the person answered).
   * A photo or signature answer keeps only the files getSubmissions resolved —
   * which are this job's own (it scopes the lookup to the task). A stored id
   * that names anything else is dropped from the value too, not just unlinked.
   */
  protected stepAnswers(rows: ReportSubmissionRow[]): TaskReportStepSubmission[] {
    return rows.map((r) => {
      const form = parseStoredStepForm(r.form);
      const answers = (r.answers ?? {}) as StepFormAnswers;
      const files = (r.files ?? {}) as Record<string, ReportFileRow>;
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
              id: f.id,
              label: f.label,
              type: f.type,
              value: f.type === 'photos' ? ids : (ids[0] ?? null),
              files: ids.map((id) => ({
                ...this.file(files[id], by),
                createdAt: iso(files[id].createdAt ?? r.submittedAt)!,
              })),
            };
          }
          return { id: f.id, label: f.label, type: f.type, value: raw ?? null, files: [] };
        }),
      };
    });
  }

  protected details(rows: ReportDetailRow[]): TaskReportDetail[] {
    return rows
      .filter((v): v is ReportDetailRow & { value: string } => typeof v.value === 'string' && v.value.trim() !== '')
      .map((v) => ({
        id: v.definitionId,
        name: v.definition?.name ?? '',
        key: v.definition?.key ?? '',
        type: v.definition?.type ?? 'TEXT',
        value: v.value,
      }));
  }

  /** A signed file row, as the report shows it — never the stored provider URL or key. */
  protected file(f: ReportFileRow, by: Person | null | undefined): TaskReportFile {
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
