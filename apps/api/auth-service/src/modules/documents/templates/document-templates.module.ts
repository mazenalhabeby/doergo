import { Module } from '@nestjs/common';
import { DocumentCoreModule } from '../core/document-core.module';
import { DocumentTemplatesService } from './document-templates.service';
import { ContractIssueService } from './contract-issue.service';

/**
 * Contract templates, and issuing a contract from one.
 */
@Module({
  imports: [DocumentCoreModule],
  providers: [DocumentTemplatesService, ContractIssueService],
  exports: [DocumentTemplatesService, ContractIssueService],
})
export class DocumentTemplatesModule {}
