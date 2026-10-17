import { Module } from '@nestjs/common';
import { SignLinkController } from './sign-link.controller';
import { DocumentsController } from './documents.controller';
import { DocumentTypesController } from './document-types.controller';
import { DocumentComplianceController } from './document-compliance.controller';
import { DocumentDraftsController } from './document-drafts.controller';
import { DocumentTemplatesController } from './document-templates.controller';
import { DocumentSigningController } from './document-signing.controller';
import { DocumentsGatewayService } from './documents.service';

/**
 * AUTH_SERVICE is registered globally in app.module, as it is for every other
 * gateway module — this contributes the routes and the client wrapper that maps
 * RPC errors back to real HTTP statuses.
 */
@Module({
  // Static paths first (types, compliance, drafts, templates), `:id/...` last — Express matches in this order.
  controllers: [
    DocumentTypesController,
    DocumentComplianceController,
    DocumentDraftsController,
    DocumentTemplatesController,
    DocumentsController,
    DocumentSigningController,
    SignLinkController,
  ],
  providers: [DocumentsGatewayService],
})
export class DocumentsModule {}
