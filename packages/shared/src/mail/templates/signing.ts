/** Emails asking a client to sign, and sending a signing link again. */
import { bold, emailTranslator, escapeHtml } from '../email-render';
import { brandHeader, done, type Locale, type RenderedEmail } from './base';

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
