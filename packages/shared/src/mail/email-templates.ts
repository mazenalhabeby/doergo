import type { SupportedLocale } from '../notifications/locale';
import { EMAIL_MESSAGES, type EmailKey } from './email-messages';
import { bold, emailDocument, emailTranslator, escapeHtml, subjectLine, type EmailTranslator } from './email-render';

/**
 * Every email the product sends, as a pure function of a language and the facts.
 *
 * WHY THE TEMPLATES LIVE TOGETHER, AWAY FROM THE SENDERS: a sender's job is to
 * decide who gets a message, in which language, and to deliver it through a
 * route that works. What the message SAYS is a different concern, and with the
 * two mixed the only way to know whether a mail is translated is to read every
 * service that sends one. Here, the guard spec reads the senders and finds no
 * markup and no sentences at all — and reads this file and finds no sentence
 * that is not a catalogue key.
 *
 * The HTML is the product's existing house style, kept as it was: 600px,
 * Arial, the blue wordmark. Only the words moved. Every value goes through
 * `t.html` (escaped) or `escapeHtml`, including values the product generated
 * itself — a code or a URL is cheap to escape and expensive to audit.
 */

export interface RenderedEmail {
  locale: SupportedLocale;
  subject: string;
  html: string;
}

/** Locale is `unknown` on purpose: null, "de-AT" and garbage are all handled in one place. */
type Locale = unknown;

const BRAND_HEADER = `
        <div style="text-align: center; padding: 30px 0;">
          <h1 style="color: #2563eb; margin: 0;">HBC FIELD</h1>
          TAGLINE
        </div>`;

function brandHeader(t: EmailTranslator, withTagline: boolean): string {
  const tagline = withTagline ? `<p style="color: #64748b; margin-top: 4px;">${t.html('layout.tagline')}</p>` : '';
  return BRAND_HEADER.replace('TAGLINE', tagline);
}

function done(t: EmailTranslator, subject: string, body: string): RenderedEmail {
  return { locale: t.locale, subject: subjectLine(subject), html: emailDocument(t.locale, body) };
}

/** A role label, or the role as stored when it is one the catalogue does not name. */
const ROLE_ALIASES: Record<string, string> = { DISPATCHER: 'MANAGER', TECHNICIAN: 'EMPLOYEE', CLIENT: 'ADMIN' };
function roleLabel(t: EmailTranslator, role: string | null | undefined): string {
  const upper = String(role ?? '').toUpperCase();
  const key = `role.${ROLE_ALIASES[upper] ?? upper}`;
  return isKey(key) ? t.text(key) : String(role ?? '');
}

function priorityLabel(t: EmailTranslator, priority: string | null | undefined): string {
  const key = `priority.${String(priority ?? '').toUpperCase()}`;
  return isKey(key) ? t.text(key) : String(priority ?? '');
}

// Checked against English, which is the shape every other language is typed to.
function isKey(key: string): key is EmailKey {
  return Object.prototype.hasOwnProperty.call(EMAIL_MESSAGES.en, key);
}

/** "Label: value" — both escaped. */
function field(t: EmailTranslator, label: EmailKey, value: string): string {
  return `<p><strong>${t.html(label)}:</strong> ${escapeHtml(value)}</p>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Password reset — to a member, in the member's language
// ═══════════════════════════════════════════════════════════════════════════

export function passwordResetEmail(
  locale: Locale,
  data: { firstName: string; resetLink: string; expiresInHours: number },
): RenderedEmail {
  const t = emailTranslator(locale);
  const link = escapeHtml(data.resetLink);
  const body = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${t.html('passwordReset.heading')}</h2>
            <p>${t.html('layout.greeting', { name: data.firstName })}</p>
            <p>${t.html('passwordReset.intro')}</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                ${t.html('passwordReset.button')}
              </a>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t.html('layout.linkFallback')}</p>
            <p style="color: #64748b; font-size: 14px; word-break: break-all;">${link}</p>
            <p style="color: #64748b; font-size: 14px;">${t.html({ plural: 'passwordReset.expires', count: data.expiresInHours })}</p>
            <p style="color: #64748b; font-size: 14px;">${t.html('passwordReset.ignore')}</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 12px;">${t.html('layout.automatedMessage')}</p>
          </div>
        `;
  return done(t, t.text('passwordReset.subject'), body);
}

// ═══════════════════════════════════════════════════════════════════════════
// Invitation — to somebody who may not have an account yet
// ═══════════════════════════════════════════════════════════════════════════

export function invitationEmail(
  locale: Locale,
  data: { organizationName?: string | null; invitationCode: string; targetRole: string; expiresAt: string | Date },
): RenderedEmail {
  const t = emailTranslator(locale);
  const org = data.organizationName?.trim();
  const role = bold(roleLabel(t, data.targetRole));
  const date = t.date(data.expiresAt, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${brandHeader(t, true)}

        <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; text-align: center;">
          <h2 style="color: #1e293b; margin-top: 0;">${t.html('invitation.heading')}</h2>
          <p style="color: #475569;">
            ${org ? t.html('invitation.intro', { org: bold(org), role }) : t.html('invitation.introNoOrg', { role })}
          </p>

          <div style="background: linear-gradient(135deg, #eff6ff, #e0e7ff); border: 2px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 8px 0;">${t.html('invitation.codeLabel')}</p>
            <p style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 0.3em; color: #1e40af; margin: 0;">
              ${escapeHtml(data.invitationCode)}
            </p>
          </div>

          <p style="color: #475569;">
            ${t.html('invitation.stepsIntro')}
          </p>
          <ol style="color: #475569; text-align: left; padding-left: 20px;">
            <li>${t.html('invitation.step1')}</li>
            <li>${t.html('invitation.step2')}</li>
            <li>${t.html('invitation.step3')}</li>
            <li>${t.html('invitation.step4')}</li>
          </ol>

          <p style="color: #94a3b8; font-size: 13px; margin-top: 20px;">
            ${t.html('invitation.expires', { date })}
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          ${t.html('invitation.footer')}
        </p>
      </div>
    `;
  return done(t, org ? t.text('invitation.subject', { org }) : t.text('invitation.subjectNoOrg'), body);
}

// ═══════════════════════════════════════════════════════════════════════════
// Attendance and tasks — to members
// ═══════════════════════════════════════════════════════════════════════════

export function geofenceAlertEmail(
  locale: Locale,
  data: { userName: string; locationName: string; distance: number; allowedRadius: number; action: 'clock_in' | 'clock_out' },
): RenderedEmail {
  const t = emailTranslator(locale);
  const action = data.action === 'clock_out' ? 'clock_out' : 'clock_in';
  const meters = (n: number) => t.text('unit.meters', { meters: Math.round(n) });
  const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">${t.html('geofence.heading')}</h2>
        <p>${t.html(`geofence.intro.${action}` as const)}</p>

        <div style="background-color: #fef2f2; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <h3 style="margin-top: 0; color: #991b1b;">${t.html('geofence.details')}</h3>
          ${field(t, 'label.member', data.userName)}
          ${field(t, 'label.location', data.locationName)}
          ${field(t, 'label.distance', meters(data.distance))}
          ${field(t, 'label.allowedRadius', meters(data.allowedRadius))}
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 12px;">
          ${t.html('layout.automatedAlert')}
        </p>
      </div>
    `;
  return done(t, t.text(`geofence.subject.${action}` as const, { name: data.userName }), body);
}

export function autoClockOutEmail(
  locale: Locale,
  data: {
    userName: string;
    locationName: string;
    clockInTime: string;
    clockOutTime: string;
    totalHours: number;
    reason: 'exceeded_duration' | 'end_of_day';
  },
): RenderedEmail {
  const t = emailTranslator(locale);
  const reason = data.reason === 'exceeded_duration' ? 'exceeded_duration' : 'end_of_day';
  const hours = t.text({ plural: 'unit.hours', count: Math.round(data.totalHours * 10) / 10 });
  const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">${t.html('autoClockOut.heading')}</h2>
        <p>${t.html('layout.greeting', { name: data.userName })}</p>
        <p>${t.html(`autoClockOut.reason.${reason}` as const)}</p>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #334155;">${t.html('autoClockOut.details')}</h3>
          ${field(t, 'label.location', data.locationName)}
          ${field(t, 'label.clockIn', data.clockInTime)}
          ${field(t, 'label.clockOut', data.clockOutTime)}
          ${field(t, 'label.totalHours', hours)}
        </div>

        <p style="color: #64748b; font-size: 14px;">
          ${t.html('autoClockOut.contact')}
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 12px;">
          ${t.html('layout.automatedMessage')}
        </p>
      </div>
    `;
  return done(t, t.text('autoClockOut.subject', { location: data.locationName }), body);
}

interface TaskFacts {
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  locationAddress?: string | null;
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
    `;
  return done(t, t.text('taskAssigned.subject', { task: task.title }), body);
}

export function taskCompletedEmail(locale: Locale, task: TaskFacts): RenderedEmail {
  const t = emailTranslator(locale);
  const body = `
      <h2>${t.html('taskCompleted.heading')}</h2>
      ${field(t, 'label.title', task.title ?? '')}
      <p>${t.html('taskCompleted.body')}</p>
    `;
  return done(t, t.text('taskCompleted.subject', { task: task.title }), body);
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

// ═══════════════════════════════════════════════════════════════════════════
// Client signing — to a client's address, usually not an account
// ═══════════════════════════════════════════════════════════════════════════

const SIGN_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/**
 * It names the documents rather than counting them, because a client who
 * cannot tell what is waiting has to open the link to find out whether it
 * matters. It gives the expiry as a DATE, since the mail may be read a week
 * after it arrives. And it attaches nothing: the file is the thing being
 * signed, and a copy loose in a mailbox is a copy nobody can prove anything
 * about.
 */
export function signLinkEmail(
  locale: Locale,
  data: {
    organizationName: string;
    documents: Array<{ title: string; forMember: string | null }>;
    url: string;
    expiresAt: Date;
  },
): RenderedEmail {
  const t = emailTranslator(locale);
  const count = data.documents.length;
  const org = data.organizationName;
  const until = bold(t.date(data.expiresAt, SIGN_DATE));
  const items = data.documents
    .map(
      (d) =>
        `<li style="color:#1e293b;font-size:14px;margin-bottom:5px;">${escapeHtml(d.title)}${d.forMember ? ` — ${escapeHtml(d.forMember)}` : ''}</li>`,
    )
    .join('');
  const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${brandHeader(t, true)}

        <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; text-align: center;">
          <h2 style="color: #1e293b; margin-top: 0;">
            ${t.html({ plural: 'sign.heading', count })}
          </h2>
          <p style="color: #475569;">
            ${t.html({ plural: 'sign.intro', count }, { org: bold(org) })}
          </p>

          <div style="background:#eef4ff;border:1px solid #cfe0ff;border-radius:10px;padding:14px 16px;margin:18px 0;text-align:left;">
            <p style="color:#64748b;font-size:12px;margin:0 0 8px 0;">${t.html('sign.waiting')}</p>
            <ul style="margin:0;padding-left:18px;">${items}</ul>
          </div>

          <a href="${escapeHtml(data.url)}"
             style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:9px;font-weight:bold;margin:6px 0 14px;">
            ${t.html('sign.button')}
          </a>

          <p style="color:#94a3b8;font-size:13px;margin-bottom:0;">
            ${t.html({ plural: 'sign.validity', count }, { date: until })}
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          ${t.html('sign.footer', { org })}<br>
          HBCField · hbcfield.com
        </p>
      </div>
    `;
  return done(t, t.text({ plural: 'sign.subject', count }, { org }), body);
}

/** The re-issue mail: same page, no document list — they asked for the way back, not for news. */
export function signReissueEmail(
  locale: Locale,
  data: { organizationName: string; url: string; expiresAt: Date },
): RenderedEmail {
  const t = emailTranslator(locale);
  const until = bold(t.date(data.expiresAt, SIGN_DATE));
  const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${brandHeader(t, false)}
        <div style="background-color:#f8fafc;border-radius:12px;padding:24px;text-align:center;">
          <h2 style="color:#1e293b;margin-top:0;">${t.html('signReissue.heading')}</h2>
          <p style="color:#475569;">
            ${t.html('signReissue.intro', { org: bold(data.organizationName) })}
          </p>
          <a href="${escapeHtml(data.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:9px;font-weight:bold;margin:6px 0 14px;">
            ${t.html('signReissue.button')}
          </a>
          <p style="color:#94a3b8;font-size:13px;margin-bottom:0;">
            ${t.html('signReissue.validity', { date: until })}
          </p>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
        <p style="color:#94a3b8;font-size:12px;text-align:center;">HBCField · hbcfield.com</p>
      </div>`;
  return done(t, t.text('signReissue.subject', { org: data.organizationName }), body);
}
