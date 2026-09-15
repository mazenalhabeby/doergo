import { readFileSync } from 'fs';
import { join } from 'path';
import {
  EMAIL_MESSAGES,
  SUPPORTED_LOCALES,
  autoClockOutEmail,
  emailTranslator,
  geofenceAlertEmail,
  invitationEmail,
  passwordResetEmail,
  scheduledReportEmail,
  signLinkEmail,
  signReissueEmail,
  subjectLine,
  taskAssignedEmail,
  taskCompletedEmail,
  type EmailKey,
} from '@hbcfield/shared';

/**
 * The email catalogue (packages/shared/src/mail) is complete in every language,
 * and the templates write it safely.
 *
 * It lives in shared because three services send mail; it is tested here
 * because shared has no test runner and this is the service that sends most of
 * it.
 */
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('email message catalogue', () => {
  const en = EMAIL_MESSAGES.en;
  const keys = Object.keys(en) as EmailKey[];

  it('has a catalogue for every supported locale and nothing else', () => {
    expect(Object.keys(EMAIL_MESSAGES).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))('%s has exactly the English keys', (locale) => {
    expect(Object.keys(EMAIL_MESSAGES[locale]).sort()).toEqual([...keys].sort());
  });

  /*
    A German reset email that forgot {{count}} says "Dieser Link ist Stunden
    gültig" — delivered, grammatical, and useless.
  */
  it.each(SUPPORTED_LOCALES)('%s uses the same placeholders as English, key by key', (locale) => {
    const mismatched = keys.filter(
      (key) => placeholders(EMAIL_MESSAGES[locale][key]).join() !== placeholders(en[key]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it.each(SUPPORTED_LOCALES)('%s leaves no sentence empty', (locale) => {
    expect(keys.filter((key) => !EMAIL_MESSAGES[locale][key]?.trim())).toEqual([]);
  });

  it('writes every plural as a complete one/other pair', () => {
    const ones = keys.filter((k) => k.endsWith('.one')).map((k) => k.slice(0, -4));
    const others = keys.filter((k) => k.endsWith('.other')).map((k) => k.slice(0, -6));
    expect(ones.sort()).toEqual(others.sort());
  });

  it('only uses placeholders in the {{name}} form, and no markup', () => {
    const malformed = SUPPORTED_LOCALES.flatMap((locale) =>
      keys
        .filter((key) => {
          const text = EMAIL_MESSAGES[locale][key];
          // Markup belongs to the template, which escapes around it; a tag in
          // here would be escaped and show up as "<strong>" in the inbox.
          return /[<>]/.test(text) || /\{(?!\{)|\{\{\s/.test(text.replace(/\{\{\w+\}\}/g, ''));
        })
        .map((key) => `${locale}:${key}`),
    );
    expect(malformed).toEqual([]);
  });

  /* ⚠️ Product rule: time is counted or worked, never "paid", in any language. */
  it('never talks about pay, in any language', () => {
    const pay = /\b(un)?paid\b|bezahlt|vergütet|pagad|remunerad|payé|rémunér|pagat|retribuit/i;
    const offending = SUPPORTED_LOCALES.flatMap((locale) =>
      keys.filter((key) => pay.test(EMAIL_MESSAGES[locale][key])).map((key) => `${locale}:${key}`),
    );
    expect(offending).toEqual([]);
  });

  it('addresses a German reader formally', () => {
    const informal = keys.filter((key) => /\b(du|dich|dir|dein\w*)\b/i.test(EMAIL_MESSAGES.de[key]));
    expect(informal).toEqual([]);
    expect(EMAIL_MESSAGES.de['passwordReset.intro']).toMatch(/\bIhres\b/);
  });

  /*
    The invitation tells a stranger which option to choose in the app. If that
    label is not what the app shows in their language, the step is a dead end
    for exactly the person the email exists for.
  */
  it.each(SUPPORTED_LOCALES)('%s names the onboarding option exactly as the app labels it', (locale) => {
    const bundle = JSON.parse(
      readFileSync(join(__dirname, '../../../../../mobile/src/i18n/locales', `${locale}.json`), 'utf8'),
    );
    const label: string = bundle.onboarding.choosePath.useInvitation.title;
    expect(EMAIL_MESSAGES[locale]['invitation.step3']).toContain(label);
  });
});

describe('email templates', () => {
  const EXPIRES = new Date('2026-09-20T12:00:00Z');

  it('writes the whole email in the recipient’s language, and says so on the html element', () => {
    const de = passwordResetEmail('de', { firstName: 'Anna', resetLink: 'https://x/reset?token=t', expiresInHours: 1 });
    expect(de.locale).toBe('de');
    expect(de.subject).toBe('HBCField – Passwort zurücksetzen');
    expect(de.html).toContain('<html lang="de" dir="ltr">');
    expect(de.html).toContain('Guten Tag Anna,');
    expect(de.html).toContain('Passwort zurücksetzen');
    expect(de.html).toContain('Dieser Link ist 1 Stunde gültig.');
    expect(de.html).not.toMatch(/Reset password|Hello/);

    const fr = passwordResetEmail('fr', { firstName: 'Luc', resetLink: 'https://x', expiresInHours: 2 });
    expect(fr.html).toContain('<html lang="fr" dir="ltr">');
    expect(fr.html).toContain('Ce lien expire dans 2 heures.');
  });

  it.each([null, undefined, '', 'pt', 'klingon', 42])('falls back to English for %p', (locale) => {
    const email = taskCompletedEmail(locale, { title: 'Pump' });
    expect(email.locale).toBe('en');
    expect(email.subject).toBe('Task completed: Pump');
    expect(email.html).toContain('<html lang="en" dir="ltr">');
  });

  it('reads a regional locale as its language', () => {
    expect(taskCompletedEmail('de-AT', { title: 'Pumpe' }).subject).toBe('Aufgabe abgeschlossen: Pumpe');
  });

  it.each(SUPPORTED_LOCALES)('%s renders every template with no placeholder left behind', (locale) => {
    const all = [
      passwordResetEmail(locale, { firstName: 'A', resetLink: 'https://x', expiresInHours: 1 }),
      invitationEmail(locale, { organizationName: 'Acme', invitationCode: 'ABCDE12345', targetRole: 'EMPLOYEE', expiresAt: EXPIRES }),
      geofenceAlertEmail(locale, { userName: 'A', locationName: 'B', distance: 120.4, allowedRadius: 50, action: 'clock_out' }),
      autoClockOutEmail(locale, { userName: 'A', locationName: 'B', clockInTime: '08:00', clockOutTime: '18:00', totalHours: 10, reason: 'end_of_day' }),
      taskAssignedEmail(locale, { title: 'T', priority: 'HIGH' }),
      taskCompletedEmail(locale, { title: 'T' }),
      scheduledReportEmail(locale, { reportName: 'R', generatedAt: EXPIRES, columns: [], rows: [] }),
      signLinkEmail(locale, { organizationName: 'Acme', documents: [{ title: 'D', forMember: null }], url: 'https://x', expiresAt: EXPIRES }),
      signReissueEmail(locale, { organizationName: 'Acme', url: 'https://x', expiresAt: EXPIRES }),
    ];
    for (const email of all) {
      expect(email.subject).not.toMatch(/\{\{|\}\}|undefined/);
      expect(email.html).not.toMatch(/\{\{|\}\}|undefined|NaN/);
      expect(email.html).toContain(`<html lang="${locale}" dir="ltr">`);
    }
  });

  it('escapes everything a person typed, in the body', () => {
    const evil = '<script>alert("x")</script>';
    const org = 'Tom & Jerry <b>GmbH</b>';
    const emails = [
      invitationEmail('en', { organizationName: org, invitationCode: evil, targetRole: evil, expiresAt: EXPIRES }),
      geofenceAlertEmail('de', { userName: evil, locationName: org, distance: 1, allowedRadius: 1, action: 'clock_in' }),
      autoClockOutEmail('fr', { userName: evil, locationName: org, clockInTime: evil, clockOutTime: '1', totalHours: 1, reason: 'exceeded_duration' }),
      taskAssignedEmail('es', { title: evil, description: org, priority: evil, locationAddress: evil }),
      taskCompletedEmail('it', { title: evil }),
      passwordResetEmail('en', { firstName: evil, resetLink: 'https://x/"><script>', expiresInHours: 1 }),
      scheduledReportEmail('de', { reportName: evil, generatedAt: EXPIRES, columns: [{ label: evil, align: 'left' }], rows: [[org]] }),
      signLinkEmail('en', { organizationName: org, documents: [{ title: evil, forMember: evil }], url: 'https://x/"onmouseover="', expiresAt: EXPIRES }),
      signReissueEmail('en', { organizationName: evil, url: 'https://x', expiresAt: EXPIRES }),
    ];
    for (const { html } of emails) {
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>GmbH');
      expect(html).not.toContain('"onmouseover="');
    }
    expect(emails[0].html).toContain('<strong>Tom &amp; Jerry &lt;b&gt;GmbH&lt;/b&gt;</strong>');
    expect(emails[1].html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('keeps a subject plain text on one line — escaping a header would show "&amp;" in the inbox', () => {
    const email = taskAssignedEmail('en', { title: 'Tom & Jerry\r\nBcc: someone@evil.test' });
    expect(email.subject).toBe('Task assigned: Tom & Jerry Bcc: someone@evil.test');
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(subjectLine('A document needs your signature — ')).toBe('A document needs your signature');
  });

  it('chooses the plural form, and names the documents, in the reader’s language', () => {
    const one = signLinkEmail('de', { organizationName: 'Acme', documents: [{ title: 'Stundenzettel', forMember: 'Ana' }], url: 'https://x', expiresAt: EXPIRES });
    expect(one.subject).toBe('Ein Dokument wartet auf Ihre Unterschrift — Acme');
    expect(one.html).toContain('Stundenzettel — Ana');
    expect(one.html).toContain('<strong>20. September 2026</strong>');

    const three = signLinkEmail('it', {
      organizationName: 'Acme',
      documents: [1, 2, 3].map((n) => ({ title: `D${n}`, forMember: null })),
      url: 'https://x',
      expiresAt: EXPIRES,
    });
    expect(three.subject).toBe('3 documenti richiedono la tua firma — Acme');
    expect(three.html).toContain('Puoi firmarli tutti in una volta.');
  });

  it('translates a role and a priority, and leaves an unknown one as stored', () => {
    expect(invitationEmail('de', { organizationName: 'A', invitationCode: 'C', targetRole: 'EMPLOYEE', expiresAt: EXPIRES }).html)
      .toContain('als <strong>Mitarbeiter</strong> beizutreten');
    expect(invitationEmail('fr', { organizationName: 'A', invitationCode: 'C', targetRole: 'TECHNICIAN', expiresAt: EXPIRES }).html)
      .toContain('<strong>Employé</strong>');
    expect(invitationEmail('en', { organizationName: 'A', invitationCode: 'C', targetRole: 'FOREMAN', expiresAt: EXPIRES }).html)
      .toContain('<strong>FOREMAN</strong>');
    expect(taskAssignedEmail('es', { title: 'T', priority: 'URGENT' }).html).toContain('Urgente');
  });

  it('writes numbers and dates the way the reader does', () => {
    expect(autoClockOutEmail('de', { userName: 'A', locationName: 'B', clockInTime: '', clockOutTime: '', totalHours: 8.5, reason: 'end_of_day' }).html)
      .toContain('8,5 Stunden');
    expect(invitationEmail('es', { organizationName: 'A', invitationCode: 'C', targetRole: 'ADMIN', expiresAt: EXPIRES }).html)
      .toContain('20 de septiembre de 2026');
    expect(emailTranslator('fr').number(1234.5)).toBe(new Intl.NumberFormat('fr', { maximumFractionDigits: 1 }).format(1234.5));
  });

  it('writes a whole sentence of its own when no organization name is known', () => {
    const email = invitationEmail('it', { organizationName: '  ', invitationCode: 'C', targetRole: 'ADMIN', expiresAt: EXPIRES });
    expect(email.subject).toBe('Sei stato invitato su HBCField');
    expect(email.html).toContain('unirti alla tua organizzazione come <strong>Amministratore</strong>');
  });
});
