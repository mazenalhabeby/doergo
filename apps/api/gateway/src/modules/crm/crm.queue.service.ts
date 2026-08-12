import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, CRM_JOB_TYPES, BaseQueueService } from '@hbcfield/shared';

// WRITE operations — BullMQ jobs to the task-service CRM processor.
@Injectable()
export class CrmQueueService extends BaseQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.CRM) crmQueue: Queue,
    configService: ConfigService,
  ) {
    super(crmQueue, configService, QUEUE_NAMES.CRM, CrmQueueService.name);
  }

  // Pipelines & stages
  createPipeline(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.PIPELINE_CREATE, d); }
  updatePipeline(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.PIPELINE_UPDATE, d); }
  deletePipeline(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.PIPELINE_DELETE, d); }
  createStage(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.STAGE_CREATE, d); }
  updateStage(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.STAGE_UPDATE, d); }
  deleteStage(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.STAGE_DELETE, d); }
  reorderStages(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.STAGE_REORDER, d); }

  // Contacts
  createContact(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.CONTACT_CREATE, d); }
  updateContact(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.CONTACT_UPDATE, d); }
  deleteContact(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.CONTACT_DELETE, d); }

  // Leads
  createLead(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.LEAD_CREATE, d); }
  updateLead(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.LEAD_UPDATE, d); }
  deleteLead(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.LEAD_DELETE, d); }
  convertLead(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.LEAD_CONVERT, d); }

  // Deals
  createDeal(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.DEAL_CREATE, d); }
  updateDeal(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.DEAL_UPDATE, d); }
  deleteDeal(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.DEAL_DELETE, d); }
  moveDealStage(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.DEAL_MOVE_STAGE, d); }

  // Activities
  createActivity(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.ACTIVITY_CREATE, d); }
  updateActivity(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.ACTIVITY_UPDATE, d); }
  deleteActivity(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.ACTIVITY_DELETE, d); }

  // Quotes
  createQuote(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.QUOTE_CREATE, d); }
  updateQuote(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.QUOTE_UPDATE, d); }
  deleteQuote(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.QUOTE_DELETE, d); }
  setQuoteStatus(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.QUOTE_SET_STATUS, d); }
  convertQuoteToInvoice(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.QUOTE_CONVERT_INVOICE, d); }

  // Commissions
  createCommissionRule(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.COMMISSION_RULE_CREATE, d); }
  updateCommissionRule(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.COMMISSION_RULE_UPDATE, d); }
  deleteCommissionRule(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.COMMISSION_RULE_DELETE, d); }
  setCommissionEntryStatus(d: any) { return this.addJobAndWait(CRM_JOB_TYPES.COMMISSION_ENTRY_SET_STATUS, d); }
}
