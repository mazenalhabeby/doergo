import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuditLogService } from './audit-log.service';

@Controller()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @MessagePattern({ cmd: 'audit_log_write' })
  async writeLog(@Payload() data: {
    eventType: string;
    userId?: string;
    targetUserId?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    organizationId: string;
  }) {
    await this.auditLogService.log(data);
    return { success: true };
  }

  @MessagePattern({ cmd: 'audit_log_list' })
  async listLogs(@Payload() query: {
    organizationId: string;
    eventType?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    return this.auditLogService.findAll(query);
  }
}
