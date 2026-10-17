/** What every email is built from: the rendered shape, the brand header, labels, a field row, a button, the preferences footer. */
import type { SupportedLocale } from '../../notifications/locale';
import { emailDocument, escapeHtml, subjectLine, type EmailTranslator } from '../email-render';
import { EMAIL_MESSAGES, type EmailKey } from '../email-messages';

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

/** A button to a page in the product. The url is ours, and escaped anyway. */
function button(t: EmailTranslator, label: EmailKey, url: string): string {
  return `
        <div style="text-align: center; margin: 28px 0;">
          <a href="${escapeHtml(url)}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${t.html(label)}
          </a>
        </div>`;
}

/** Why the reader is getting this, and where it is switched off. */
function prefsFooter(t: EmailTranslator): string {
  return `
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 12px;">${t.html('layout.emailPrefsHint')}</p>`;
}

export { Locale, brandHeader, done, roleLabel, priorityLabel, field, button, prefsFooter };
