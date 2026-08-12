import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, CRM_JOB_TYPES, BaseQueueService } from '@hbcfield/shared';

// WRITE operations — BullMQ jobs to the task-service CRM processor (contacts +
// commissions only; deals/pipeline are Task writes).
@Injectable()
export class CrmQueueService extends BaseQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.CRM) crmQueue: Queue,
    configService: ConfigService,
  ) {
    super(crmQueue, configService, QUEUE_NAMES.CRM, CrmQueueService.name);
  }

  // Contacts
  createContact(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.CONTACT_CREATE, d); }
  updateContact(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.CONTACT_UPDATE, d); }
  deleteContact(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.CONTACT_DELETE, d); }

  // Commissions
  createCommissionRule(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.COMMISSION_RULE_CREATE, d); }
  updateCommissionRule(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.COMMISSION_RULE_UPDATE, d); }
  deleteCommissionRule(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.COMMISSION_RULE_DELETE, d); }
  setCommissionEntryStatus(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.COMMISSION_ENTRY_SET_STATUS, d); }
}
