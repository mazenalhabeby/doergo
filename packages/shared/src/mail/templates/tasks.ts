/** Emails about jobs: assigned, completed, the digest, and a scheduled report. */
import { emailTranslator, escapeHtml } from '../email-render';
import { button, done, field, prefsFooter, priorityLabel, type Locale, type RenderedEmail } from './base';

interface TaskFacts {
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  locationAddress?: string | null;
  /** Where the task opens. Without one the email carries no button. */
  url?: string | null;
}

export function taskAssignedEmail(locale: Locale, task: TaskFacts): RenderedEmail {
  const t = emailTranslator(locale);
  const na = t.text('layout.notAvailable');
  const body = `
      <h2>${t.html('taskAssigned.heading')}</h2>
      ${field(t, 'label.title', task.title ?? '')}
      ${field(t, 'label.description', task.description || na)}
      ${field(t, 'label.priority', priorityLabel(t, task.priority))}
      ${field(t, 'label.location', task.locationAddress || na)}
      ${task.url ? button(t, 'task.button', task.url) : ''}
      ${prefsFooter(t)}
    `;
  return done(t, t.text('taskAssigned.subject', { task: task.title }), body);
}

export function taskCompletedEmail(locale: Locale, task: TaskFacts): RenderedEmail {
  const t = emailTranslator(locale);
  const body = `
      <h2>${t.html('taskCompleted.heading')}</h2>
      ${field(t, 'label.title', task.title ?? '')}
      <p>${t.html('taskCompleted.body')}</p>
      ${task.url ? button(t, 'task.button', task.url) : ''}
      ${prefsFooter(t)}
    `;
  return done(t, t.text('taskCompleted.subject', { task: task.title }), body);
}

/**
 * Several of the same task email folded into one.
 *
 * Twenty tasks assigned in one go are one piece of news to the person who got
 * them. The first went on its own at once (see KeyedCoalescer); this carries the
 * rest of the burst, NAMED rather than counted — a bare count makes the reader
 * open the app to learn whether any of it matters.
 */
export function taskDigestEmail(
  locale: Locale,
  data: { kind: 'assigned' | 'completed'; tasks: TaskFacts[]; url?: string | null },
): RenderedEmail {
  const t = emailTranslator(locale);
  const kind = data.kind === 'completed' ? 'completed' : 'assigned';
  const count = data.tasks.length;
  const items = data.tasks
    .map((task) => {
      const title = escapeHtml(task.title ?? '');
      const link = task.url ? `<a href="${escapeHtml(task.url)}" style="color: #2563eb;">${title}</a>` : title;
      return `<li style="margin-bottom: 6px;">${link}</li>`;
    })
    .join('');
  const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${t.html({ plural: `taskDigest.${kind}.heading` as const, count })}</h2>
        <p>${t.html({ plural: `taskDigest.${kind}.intro` as const, count })}</p>
        <ul style="padding-left: 20px;">${items}</ul>
        ${data.url ? button(t, 'taskDigest.button', data.url) : ''}
        ${prefsFooter(t)}
      </div>
    `;
  return done(t, t.text({ plural: `taskDigest.${kind}.subject` as const, count }), body);
}

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled report — the frame is translated; the report's own column names
// and values are data, and arrive already formatted
// ═══════════════════════════════════════════════════════════════════════════

export function scheduledReportEmail(
  locale: Locale,
  data: {
    reportName: string;
    generatedAt: Date;
    columns: Array<{ label: string; align: 'left' | 'right' }>;
    /** Cell text, already formatted, in column order. Escaped here. */
    rows: string[][];
  },
): RenderedEmail {
  const t = emailTranslator(locale);
  const generated = `${t.date(data.generatedAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
  const th = data.columns
    .map(
      (c) =>
        `<th style="text-align:${c.align};padding:8px 12px;border-bottom:2px solid #e2e8f0;font-size:12px;color:#64748b;text-transform:uppercase;">${escapeHtml(c.label)}</th>`,
    )
    .join('');
  const trs = data.rows
    .map(
      (cells) =>
        `<tr>${cells
          .map(
            (cell, i) =>
              `<td style="text-align:${data.columns[i]?.align ?? 'left'};padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;">${escapeHtml(cell)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  const content = data.rows.length
    ? `<table style="border-collapse:collapse;width:100%;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
    : `<p style="color:#64748b;">${t.html('report.empty')}</p>`;
  const body = `
      <div style="font-family:Inter,system-ui,sans-serif;color:#1e293b;">
        <h2 style="margin:0 0 4px;">${escapeHtml(data.reportName)}</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:13px;">${t.html('report.generated', { date: generated })}</p>
        ${content}
        <p style="margin-top:20px;color:#94a3b8;font-size:12px;">${t.html('report.footer')}</p>
      </div>`;
  return done(t, t.text('report.subject', { name: data.reportName }), body);
}
