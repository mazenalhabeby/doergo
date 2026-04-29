import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OvertimeService } from './overtime.service';

@Controller()
export class OvertimeController {
  constructor(private readonly overtimeService: OvertimeService) {}

  @MessagePattern({ cmd: 'get_active_overtime' })
  async getActive(@Payload() data: { userId: string }) {
    return this.overtimeService.getActive(data);
  }

  @MessagePattern({ cmd: 'get_pending_overtime_approvals' })
  async getPendingApprovals(@Payload() data: { organizationId: string }) {
    return this.overtimeService.getPendingApprovals(data);
  }

  @MessagePattern({ cmd: 'get_overtime_history' })
  async getHistory(@Payload() data: any) {
    return this.overtimeService.getHistory(data);
  }
}
