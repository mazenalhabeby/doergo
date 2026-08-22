import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { smtpTransportOptions } from '@hbcfield/shared';

// Escape HTML to prevent XSS in email content
function esc(str: string | undefined | null): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null;

  constructor(private configService: ConfigService) {
    // Same settings the auth service uses, from the same place — the two
    // transports had drifted into one shape that could only reach a STARTTLS
    // provider on the port it happened to be given.
    const smtp = smtpTransportOptions({
      SMTP_HOST: this.configService.get('SMTP_HOST'),
      SMTP_PORT: this.configService.get('SMTP_PORT'),
      SMTP_USER: this.configService.get('SMTP_USER'),
      SMTP_PASS: this.configService.get('SMTP_PASS'),
      SMTP_SECURE: this.configService.get('SMTP_SECURE'),
    });
    this.transporter = smtp ? nodemailer.createTransport(smtp) : null;
    if (!smtp) this.logger.warn('SMTP not configured — no email will be sent');
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      if (!this.transporter) {
        this.logger.warn(`No SMTP transport — dropping email to ${to} ("${subject}")`);
        return;
      }
      await this.transporter.sendMail({
        from: this.configService.get('SMTP_FROM', 'noreply@hbcfield.com'),
        to,
        subject,
        html,
      });
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      return { success: false, error };
    }
  }

  async sendTaskCreatedEmail(task: any, recipientEmail: string) {
    const subject = `New Task Created: ${esc(task.title)}`;
    const html = `
      <h2>New Task Created</h2>
      <p><strong>Title:</strong> ${esc(task.title)}</p>
      <p><strong>Description:</strong> ${esc(task.description) || 'N/A'}</p>
      <p><strong>Priority:</strong> ${esc(task.priority)}</p>
    `;
    return this.sendEmail(recipientEmail, subject, html);
  }

  async sendTaskAssignedEmail(task: any, workerEmail: string) {
    const subject = `Task Assigned: ${esc(task.title)}`;
    const html = `
      <h2>You have been assigned a new task</h2>
      <p><strong>Title:</strong> ${esc(task.title)}</p>
      <p><strong>Description:</strong> ${esc(task.description) || 'N/A'}</p>
      <p><strong>Priority:</strong> ${esc(task.priority)}</p>
      <p><strong>Location:</strong> ${esc(task.locationAddress) || 'N/A'}</p>
    `;
    return this.sendEmail(workerEmail, subject, html);
  }

  async sendTaskCompletedEmail(task: any, recipientEmail: string) {
    const subject = `Task Completed: ${esc(task.title)}`;
    const html = `
      <h2>Task Completed</h2>
      <p><strong>Title:</strong> ${esc(task.title)}</p>
      <p>The task has been marked as completed.</p>
    `;
    return this.sendEmail(recipientEmail, subject, html);
  }

  // =========================================================================
  // ATTENDANCE NOTIFICATIONS
  // =========================================================================

  async sendAutoClockOutEmail(data: {
    userEmail: string;
    userName: string;
    locationName: string;
    clockInTime: string;
    clockOutTime: string;
    totalHours: number;
    reason: 'exceeded_duration' | 'end_of_day';
  }) {
    const reasonText = data.reason === 'exceeded_duration'
      ? 'You were automatically clocked out because your shift exceeded the maximum allowed duration (16 hours).'
      : 'You were automatically clocked out at the end of the day.';

    const subject = `Auto Clock-Out: ${data.locationName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">Automatic Clock-Out Notice</h2>
        <p>Hello ${data.userName},</p>
        <p>${reasonText}</p>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #334155;">Shift Details</h3>
          <p><strong>Location:</strong> ${data.locationName}</p>
          <p><strong>Clock In:</strong> ${data.clockInTime}</p>
          <p><strong>Clock Out:</strong> ${data.clockOutTime}</p>
          <p><strong>Total Hours:</strong> ${data.totalHours.toFixed(1)} hours</p>
        </div>

        <p style="color: #64748b; font-size: 14px;">
          If you believe this was an error, please contact your supervisor.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 12px;">
          This is an automated message from HBCField.
        </p>
      </div>
    `;
    return this.sendEmail(data.userEmail, subject, html);
  }

  async sendGeofenceAlertEmail(data: {
    userEmail: string;
    userName: string;
    locationName: string;
    distance: number;
    allowedRadius: number;
    action: 'clock_in' | 'clock_out';
  }) {
    const subject = `Geofence Alert: ${data.userName} - ${data.action === 'clock_in' ? 'Clock In' : 'Clock Out'}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Geofence Alert</h2>
        <p>A technician has ${data.action === 'clock_in' ? 'clocked in' : 'clocked out'} outside the allowed geofence area.</p>

        <div style="background-color: #fef2f2; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <h3 style="margin-top: 0; color: #991b1b;">Details</h3>
          <p><strong>Technician:</strong> ${data.userName}</p>
          <p><strong>Location:</strong> ${data.locationName}</p>
          <p><strong>Distance from location:</strong> ${Math.round(data.distance)}m</p>
          <p><strong>Allowed radius:</strong> ${data.allowedRadius}m</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 12px;">
          This is an automated alert from HBCField.
        </p>
      </div>
    `;
    return this.sendEmail(data.userEmail, subject, html);
  }

  async sendAttendanceReportEmail(data: {
    recipientEmail: string;
    recipientName: string;
    reportType: 'weekly' | 'monthly';
    periodStart: string;
    periodEnd: string;
    totalHours: number;
    totalShifts: number;
    overtimeHours: number;
  }) {
    const subject = `${data.reportType === 'weekly' ? 'Weekly' : 'Monthly'} Attendance Report`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Attendance Report</h2>
        <p>Hello ${data.recipientName},</p>
        <p>Here is your ${data.reportType} attendance summary.</p>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #334155;">Summary</h3>
          <p><strong>Period:</strong> ${data.periodStart} - ${data.periodEnd}</p>
          <p><strong>Total Shifts:</strong> ${data.totalShifts}</p>
          <p><strong>Total Hours:</strong> ${data.totalHours.toFixed(1)} hours</p>
          ${data.overtimeHours > 0 ? `<p><strong>Overtime:</strong> ${data.overtimeHours.toFixed(1)} hours</p>` : ''}
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 12px;">
          This is an automated report from HBCField.
        </p>
      </div>
    `;
    return this.sendEmail(data.recipientEmail, subject, html);
  }

  async sendInvitationEmail(data: {
    recipientEmail: string;
    organizationName: string;
    invitationCode: string;
    targetRole: string;
    expiresAt: string;
  }) {
    const subject = `You're invited to join ${esc(data.organizationName)} on HBCField`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 30px 0;">
          <h1 style="color: #2563eb; margin: 0;">HBC FIELD</h1>
          <p style="color: #64748b; margin-top: 4px;">Field Service Management</p>
        </div>

        <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; text-align: center;">
          <h2 style="color: #1e293b; margin-top: 0;">You've been invited!</h2>
          <p style="color: #475569;">
            You've been invited to join <strong>${esc(data.organizationName)}</strong> as a <strong>${esc(data.targetRole)}</strong>.
          </p>

          <div style="background: linear-gradient(135deg, #eff6ff, #e0e7ff); border: 2px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 8px 0;">Your invitation code</p>
            <p style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 0.3em; color: #1e40af; margin: 0;">
              ${esc(data.invitationCode)}
            </p>
          </div>

          <p style="color: #475569;">
            To get started:
          </p>
          <ol style="color: #475569; text-align: left; padding-left: 20px;">
            <li>Download the HBCField app</li>
            <li>Create your account</li>
            <li>Choose "Use Invitation" during setup</li>
            <li>Enter the code above</li>
          </ol>

          <p style="color: #94a3b8; font-size: 13px; margin-top: 20px;">
            This invitation expires on ${new Date(data.expiresAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          This is an automated email from HBCField. If you didn't expect this invitation, you can safely ignore it.
        </p>
      </div>
    `;
    return this.sendEmail(data.recipientEmail, subject, html);
  }
}
