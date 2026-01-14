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
}
