import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { DocumentCoreModule } from '../core/document-core.module';
import { DocumentRegistersService } from './document-registers.service';
import { IssuedRegisterService } from './issued-register.service';
import { MemberDocumentsService } from './member-documents.service';
import { DocumentDownloadsService } from './document-downloads.service';
import { ComplianceBoardService } from './compliance-board.service';
import { CredentialExpiryService } from './credential-expiry.service';

/**
 * The registers: the folders, what was issued, one member's file, downloads, the compliance board and
 * the credential-expiry sweep.
 */
@Module({
  imports: [DocumentCoreModule, ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [
    DocumentRegistersService,
    IssuedRegisterService,
    MemberDocumentsService,
    DocumentDownloadsService,
    ComplianceBoardService,
    CredentialExpiryService,
  ],
  exports: [
    DocumentRegistersService,
    IssuedRegisterService,
    MemberDocumentsService,
    DocumentDownloadsService,
    ComplianceBoardService,
    CredentialExpiryService,
  ],
})
export class DocumentRegistersModule {}
