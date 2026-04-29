import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, OVERTIME_JOB_TYPES, BaseQueueService } from '@hbcfield/shared';

@Injectable()
export class OvertimeQueueService extends BaseQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.OVERTIME) overtimeQueue: Queue,
    configService: ConfigService,
  ) {
    super(
      overtimeQueue,
      configService,
      QUEUE_NAMES.OVERTIME,
      OvertimeQueueService.name,
    );
  }

  async technicianRespond(data: Record<string, any>) {
    return this.addJobAndWait(OVERTIME_JOB_TYPES.TECHNICIAN_RESPOND, data);
  }

  async leaderApprove(data: Record<string, any>) {
    return this.addJobAndWait(OVERTIME_JOB_TYPES.LEADER_APPROVE, data);
  }

  async leaderApproveSignature(data: Record<string, any>) {
    return this.addJobAndWait(OVERTIME_JOB_TYPES.LEADER_APPROVE_SIGNATURE, data);
  }

  async leaderReject(data: Record<string, any>) {
    return this.addJobAndWait(OVERTIME_JOB_TYPES.LEADER_REJECT, data);
  }
}
