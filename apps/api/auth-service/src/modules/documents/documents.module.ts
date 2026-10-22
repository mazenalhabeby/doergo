import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentCoreModule } from './core/document-core.module';
import { DocumentTypesModule } from './types/document-types.module';
import { DocumentTemplatesModule } from './templates/document-templates.module';
import { DocumentIssuingModule } from './issuing/document-issuing.module';
import { DocumentSigningModule } from './signing/document-signing.module';
import { DocumentReadingModule } from './reading/document-reading.module';
import { DocumentRegistersModule } from './registers/document-registers.module';

/**
 * The personnel file. Each part is its own module (code-structure-fix 4.3): core · types · templates ·
 * issuing · signing · reading · registers. This module holds only the DocumentsService facade and the
 * controller, and re-exports what other modules use (signing links, the credential-expiry sweep).
 */
@Module({
  imports: [
    DocumentCoreModule,
    DocumentTypesModule,
    DocumentTemplatesModule,
    DocumentIssuingModule,
    DocumentSigningModule,
    DocumentReadingModule,
    DocumentRegistersModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService, DocumentRegistersModule, DocumentSigningModule],
})
export class DocumentsModule {}
