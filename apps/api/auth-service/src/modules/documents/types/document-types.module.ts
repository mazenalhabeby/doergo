import { Module } from '@nestjs/common';
import { DocumentCoreModule } from '../core/document-core.module';
import { DocumentTypesService } from './document-types.service';
import { DocumentTypeUpdateService } from './document-type-update.service';

/**
 * The catalogue: document types, who must hand them in, who may see them.
 */
@Module({
  imports: [DocumentCoreModule],
  providers: [DocumentTypesService, DocumentTypeUpdateService],
  exports: [DocumentTypesService, DocumentTypeUpdateService],
})
export class DocumentTypesModule {}
