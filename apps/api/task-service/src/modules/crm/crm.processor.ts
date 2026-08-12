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
      // Pipelines & stages
      case CRM_JOB_TYPES.PIPELINE_CREATE: return this.crm.createPipeline(d);
      case CRM_JOB_TYPES.PIPELINE_UPDATE: return this.crm.updatePipeline(d);
      case CRM_JOB_TYPES.PIPELINE_DELETE: return this.crm.deletePipeline(d);
      case CRM_JOB_TYPES.STAGE_CREATE: return this.crm.createStage(d);
      case CRM_JOB_TYPES.STAGE_UPDATE: return this.crm.updateStage(d);
      case CRM_JOB_TYPES.STAGE_DELETE: return this.crm.deleteStage(d);
      case CRM_JOB_TYPES.STAGE_REORDER: return this.crm.reorderStages(d);
      // Contacts
      case CRM_JOB_TYPES.CONTACT_CREATE: return this.crm.createContact(d);
      case CRM_JOB_TYPES.CONTACT_UPDATE: return this.crm.updateContact(d);
      case CRM_JOB_TYPES.CONTACT_DELETE: return this.crm.deleteContact(d);
      // Leads
      case CRM_JOB_TYPES.LEAD_CREATE: return this.crm.createLead(d);
      case CRM_JOB_TYPES.LEAD_UPDATE: return this.crm.updateLead(d);
      case CRM_JOB_TYPES.LEAD_DELETE: return this.crm.deleteLead(d);
      case CRM_JOB_TYPES.LEAD_CONVERT: return this.crm.convertLead(d);
      // Deals
      case CRM_JOB_TYPES.DEAL_CREATE: return this.crm.createDeal(d);
      case CRM_JOB_TYPES.DEAL_UPDATE: return this.crm.updateDeal(d);
      case CRM_JOB_TYPES.DEAL_DELETE: return this.crm.deleteDeal(d);
      case CRM_JOB_TYPES.DEAL_MOVE_STAGE: return this.crm.moveDealStage(d);
      // Activities
      case CRM_JOB_TYPES.ACTIVITY_CREATE: return this.crm.createActivity(d);
      case CRM_JOB_TYPES.ACTIVITY_UPDATE: return this.crm.updateActivity(d);
      case CRM_JOB_TYPES.ACTIVITY_DELETE: return this.crm.deleteActivity(d);
      // Quotes
      case CRM_JOB_TYPES.QUOTE_CREATE: return this.crm.createQuote(d);
      case CRM_JOB_TYPES.QUOTE_UPDATE: return this.crm.updateQuote(d);
      case CRM_JOB_TYPES.QUOTE_DELETE: return this.crm.deleteQuote(d);
      case CRM_JOB_TYPES.QUOTE_SET_STATUS: return this.crm.setQuoteStatus(d);
      case CRM_JOB_TYPES.QUOTE_CONVERT_INVOICE: return this.crm.convertQuoteToInvoice(d);
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
