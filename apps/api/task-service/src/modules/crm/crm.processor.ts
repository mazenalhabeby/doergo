import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, CRM_JOB_TYPES, buildJobError } from '@hbcfield/shared';
import { CrmService } from './crm.service';

@Processor(QUEUE_NAMES.CRM)
export class CrmProcessor extends WorkerHost {
  private readonly logger = new Logger(CrmProcessor.name);

  constructor(private readonly crm: CrmService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    try {
      return await this.handle(job);
    } catch (error: any) {
      this.logger.error(`Job ${job.id} (${job.name}) failed: ${error.message}`);
      throw buildJobError(error);
    }
  }

  private handle(job: Job<any, any, string>): Promise<any> {
    const d = job.data;
    switch (job.name) {
      // Contacts
      case CRM_JOB_TYPES.CONTACT_CREATE: return this.crm.createContact(d);
      case CRM_JOB_TYPES.CONTACT_UPDATE: return this.crm.updateContact(d);
      case CRM_JOB_TYPES.CONTACT_DELETE: return this.crm.deleteContact(d);
      // Commissions
      case CRM_JOB_TYPES.COMMISSION_RULE_CREATE: return this.crm.createCommissionRule(d);
      case CRM_JOB_TYPES.COMMISSION_RULE_UPDATE: return this.crm.updateCommissionRule(d);
      case CRM_JOB_TYPES.COMMISSION_RULE_DELETE: return this.crm.deleteCommissionRule(d);
      case CRM_JOB_TYPES.COMMISSION_ENTRY_SET_STATUS: return this.crm.setCommissionEntryStatus(d);
      default:
        throw new Error(`Unknown CRM job type: ${job.name}`);
    }
  }
}
