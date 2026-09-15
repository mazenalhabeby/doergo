import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  EMAIL_MESSAGES,
  SUPPORTED_LOCALES,
  geofenceAlertEmail,
  invitationEmail,
  passwordResetEmail,
  scheduledReportEmail,
  shiftClosedEmail,
  signLinkEmail,
  signReissueEmail,
  taskAssignedEmail,
  taskCompletedEmail,
  taskDigestEmail,
} from '@hbcfield/shared';

/**
 * No email is written in a language its sender chose, anywhere mail is sent.
 *
 * The emails were English because each sender carried its own subject and its
 * own HTML. They now come from one set of templates in `@hbcfield/shared`, and
 * the way English comes back is quiet: a new helper with a subject typed in, a
 * `<p>Hello` added beside a template call, a service that builds its own HTML
 * "just for this one". The recipient gets a perfectly good email they cannot
 * read. So this reads the source of EVERY service that sends mail.
 *
 * Proven by planting: `sendEmail(to, 'Hello', html)`, `subject: 'Reset'`, or a
 * `<p>Your code</p>` in a sender fails the first three checks; a sentence typed
 * into a template's markup fails the fourth; `t.html('typo.key')` the fifth
 * (and the translator would render `undefined`).
 */
const API = join(__dirname, '..', '..', '..', '..', '..');
const NOTIFICATION = join(API, 'notification-service', 'src');
const SHARED_MAIL = join(API, '..', '..', 'packages', 'shared', 'src', 'mail');

function read(file: string) {
  return { file: file.slice(API.length + 1), code: stripComments(readFileSync(file, 'utf8')) };
}

/** Comments explain an email in English and must not count as one. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Every file that hands a message to SMTP or decides what one says. */
function senders() {
  const handlers = readdirSync(join(NOTIFICATION, 'handlers'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(NOTIFICATION, 'handlers', f));
  return [
    ...handlers,
    join(NOTIFICATION, 'notification.controller.ts'),
    join(NOTIFICATION, 'modules', 'email', 'email.service.ts'),
    join(NOTIFICATION, 'modules', 'email', 'member-emails.service.ts'),
    join(API, 'auth-service', 'src', 'modules', 'auth', 'auth.service.ts'),
    join(API, 'auth-service', 'src', 'modules', 'documents', 'customer-sign-mailer.service.ts'),
    join(API, 'auth-service', 'src', 'modules', 'invitations', 'invitation.service.ts'),
    join(API, 'task-service', 'src', 'modules', 'analytics', 'report-schedule.service.ts'),
  ].map(read);
}

const STRING_START = `['"\`]`;
/** Text-level markup a message would be built from. Style-free tags like <br> count too. */
const MARKUP = /<(p|h[1-6]|div|a|li|ol|ul|table|td|th|tr|strong|b|br|hr|span)[\s>/]/i;

describe('email catalogue guard', () => {
  const files = senders();

  it('finds the sources it is meant to police', () => {
    expect(files.map((f) => f.file)).toEqual(
      expect.arrayContaining([
        'notification-service/src/modules/email/email.service.ts',
        'auth-service/src/modules/auth/auth.service.ts',
        'auth-service/src/modules/documents/customer-sign-mailer.service.ts',
        'task-service/src/modules/analytics/report-schedule.service.ts',
      ]),
    );
  });

  it('never gives an email a literal subject', () => {
    const literal = new RegExp(`\\bsubject\\s*:\\s*${STRING_START}`, 'g');
    const offenders = files.flatMap(({ file, code }) =>
      [...code.matchAll(literal)].map((m) => `${file}: ${code.slice(m.index!, m.index! + 60).split('\n')[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('never passes a literal subject or body straight to a send call', () => {
    const direct = new RegExp(`\\.(sendEmail|sendMail|send)\\(\\s*[^,()]+,\\s*${STRING_START}`, 'g');
    const offenders = files.flatMap(({ file, code }) =>
      [...code.matchAll(direct)].map((m) => `${file}: ${code.slice(m.index!, m.index! + 60).split('\n')[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('builds no email markup outside the shared templates', () => {
    const offenders = files.filter(({ code }) => MARKUP.test(code)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  describe('the shared templates', () => {
    const templates = read(join(SHARED_MAIL, 'email-templates.ts'));

    /*
      A sentence typed into a template's markup reads the same in all five
      languages; a translated one does not. So every template is rendered in
      every language with values that contain no letters, and any text between
      tags that comes out identical five times — apart from the brand — is a
      sentence nobody translated. (Reading the source for this cannot work: a
      type annotation or an arrow puts ">" where no markup is.)
    */
    it('put no untranslated words in any email', () => {
      const BRAND = new Set(['HBC FIELD', 'HBCField · hbcfield.com']);
      const at = new Date('2026-09-20T12:00:00Z');
      const render = (locale: string) => [
        passwordResetEmail(locale, { firstName: '1', resetLink: '#', expiresInHours: 1 }),
        invitationEmail(locale, { organizationName: '2', invitationCode: '3', targetRole: 'EMPLOYEE', expiresAt: at }),
        invitationEmail(locale, { organizationName: null, invitationCode: '3', targetRole: 'ADMIN', expiresAt: at }),
        geofenceAlertEmail(locale, { userName: '4', locationName: '5', distance: 6, allowedRadius: 7, action: 'clock_in' }),
        shiftClosedEmail(locale, { userName: '4', locationName: '5', clockInAt: at, clockOutAt: at, timezone: 'Europe/Vienna', basis: 'SHIFT_END', confirmUrl: '#' }),
        shiftClosedEmail(locale, { userName: '4', clockInAt: at, clockOutAt: at, basis: 'LEFT_SITE', confirmUrl: '#' }),
        shiftClosedEmail(locale, { userName: '4', clockInAt: at, clockOutAt: at, basis: 'CLOCK_IN_PLUS_8H', confirmUrl: '#' }),
        taskAssignedEmail(locale, { title: '1', priority: 'LOW', url: '#' }),
        taskCompletedEmail(locale, { title: '1', url: '#' }),
        taskDigestEmail(locale, { kind: 'assigned', tasks: [{ title: '1', url: '#' }], url: '#' }),
        taskDigestEmail(locale, { kind: 'assigned', tasks: [{ title: '1' }, { title: '2' }], url: '#' }),
        taskDigestEmail(locale, { kind: 'completed', tasks: [{ title: '1' }], url: '#' }),
        taskDigestEmail(locale, { kind: 'completed', tasks: [{ title: '1' }, { title: '2' }, { title: '3' }] }),
        scheduledReportEmail(locale, { reportName: '1', generatedAt: at, columns: [{ label: '2', align: 'left' }], rows: [['3']] }),
        scheduledReportEmail(locale, { reportName: '1', generatedAt: at, columns: [], rows: [] }),
        signLinkEmail(locale, { organizationName: '2', documents: [{ title: '3', forMember: '4' }], url: '#', expiresAt: at }),
        signLinkEmail(locale, { organizationName: '2', documents: [{ title: '3', forMember: null }, { title: '5', forMember: null }], url: '#', expiresAt: at }),
        signReissueEmail(locale, { organizationName: '2', url: '#', expiresAt: at }),
      ];
      const nodes = (html: string) =>
        [...html.replace(/<head>[\s\S]*<\/head>/, '').matchAll(/>([^<>]*)</g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
      const subjects = (locale: string) => render(locale).map((e) => e.subject);

      const byLocale = SUPPORTED_LOCALES.map((l) => render(l).map((e) => nodes(e.html)));
      const offenders: string[] = [];
      byLocale[0].forEach((emailNodes, e) => {
        emailNodes.forEach((text, n) => {
          const same = byLocale.every((locale) => locale[e][n] === text);
          if (same && /[A-Za-z]{2,}/.test(text) && !BRAND.has(text)) offenders.push(`email ${e}: ${text}`);
        });
      });
      const allSubjects = SUPPORTED_LOCALES.map(subjects);
      allSubjects[0].forEach((subject, e) => {
        if (allSubjects.every((l) => l[e] === subject)) offenders.push(`subject ${e}: ${subject}`);
      });
      expect(offenders).toEqual([]);
    });

    it('only name catalogue keys that exist', () => {
      const known = new Set(Object.keys(EMAIL_MESSAGES.en));
      const named = [...templates.code.matchAll(/\bt\.(?:html|text)\(\s*'([\w.]+)'/g)].map((m) => m[1]);
      const plurals = [...templates.code.matchAll(/plural:\s*'([\w.]+)'/g)].map((m) => m[1]);
      expect(named.length).toBeGreaterThan(20);
      expect([
        ...named.filter((k) => !known.has(k)),
        ...plurals.filter((k) => !known.has(`${k}.one`)),
      ]).toEqual([]);
    });

    it('build every dynamic key from a prefix the catalogue has', () => {
      const known = Object.keys(EMAIL_MESSAGES.en);
      const prefixes = [...templates.code.matchAll(/`([\w.]+)\.\$\{/g)].map((m) => m[1]);
      expect(prefixes.filter((p) => !known.some((k) => k.startsWith(`${p}.`)))).toEqual([]);
    });

    it('escape every value they interpolate into markup', () => {
      // An interpolation inside the markup must be a translator call, an
      // escape, or a piece this file built from those. A bare `${data.x}` is
      // exactly how the geofence alert used to put a member's name in raw.
      const raw = [...templates.code.matchAll(/\$\{\s*data\.[\w.]+\s*\}/g)].map((m) => m[0]);
      expect(raw).toEqual([]);
    });
  });
});
