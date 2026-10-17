/** Emails about an account: resetting a password, an invitation, a geofence alert. */
import { bold, emailTranslator, escapeHtml } from '../email-render';
import { formatDistance } from '../../utils/distance';
import { brandHeader, done, field, roleLabel, type Locale, type RenderedEmail } from './base';

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
  data: {
    userName: string;
    locationName: string;
    distance: number;
    allowedRadius: number;
    action: 'clock_in' | 'clock_out';
  },
): RenderedEmail {
  const t = emailTranslator(locale);
  const action = data.action === 'clock_out' ? 'clock_out' : 'clock_in';
  // The shared distance formatter, in the reader's language — "9,631 km", never "9630871 m".
  const meters = (n: number) => formatDistance(n, { locale: t.locale });
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
