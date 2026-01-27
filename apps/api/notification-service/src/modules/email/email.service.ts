import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: this.configService.get('SMTP_FROM', 'noreply@doergo.com'),
        to,
        subject,
        html,
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to send email:', error);
      return { success: false, error };
    }
  }

  async sendTaskCreatedEmail(task: any, recipientEmail: string) {
    const subject = `New Task Created: ${task.title}`;
    const html = `
      <h2>New Task Created</h2>
      <p><strong>Title:</strong> ${task.title}</p>
      <p><strong>Description:</strong> ${task.description || 'N/A'}</p>
      <p><strong>Priority:</strong> ${task.priority}</p>
    `;
    return this.sendEmail(recipientEmail, subject, html);
  }

  async sendTaskAssignedEmail(task: any, workerEmail: string) {
    const subject = `Task Assigned: ${task.title}`;
    const html = `
      <h2>You have been assigned a new task</h2>
      <p><strong>Title:</strong> ${task.title}</p>
      <p><strong>Description:</strong> ${task.description || 'N/A'}</p>
      <p><strong>Priority:</strong> ${task.priority}</p>
      <p><strong>Location:</strong> ${task.locationAddress || 'N/A'}</p>
    `;
    return this.sendEmail(workerEmail, subject, html);
  }

  async sendTaskCompletedEmail(task: any, recipientEmail: string) {
    const subject = `Task Completed: ${task.title}`;
    const html = `
      <h2>Task Completed</h2>
      <p><strong>Title:</strong> ${task.title}</p>
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
          This is an automated message from Doergo Field Service Management.
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
          This is an automated alert from Doergo Field Service Management.
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
          This is an automated report from Doergo Field Service Management.
        </p>
      </div>
    `;
    return this.sendEmail(data.recipientEmail, subject, html);
  }
}
