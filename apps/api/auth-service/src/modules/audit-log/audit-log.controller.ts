import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuditLogService } from './audit-log.service';

import { pattern, auditLogWrite, auditLogList, type RpcRequest } from '@hbcfield/shared/microservices';
@Controller()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @MessagePattern(pattern(auditLogWrite))
  async writeLog(@Payload() data: RpcRequest<typeof auditLogWrite>) {
    await this.auditLogService.log(data);
    return { success: true };
  }

  @MessagePattern(pattern(auditLogList))
  async listLogs(@Payload() query: RpcRequest<typeof auditLogList>) {
    return this.auditLogService.findAll(query);
  }
}
