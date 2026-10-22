import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';
import { DocumentRoutingService } from './document-routing.service';
import { DocumentChainService } from './document-chain.service';
import { OBJECT_STORE, objectStoreProvider } from './object-store.provider';

/**
 * What every part of the personnel file asks: storage (the object store), finding a document or type,
 * telling people, routing a document to its signers, the signing chain.
 */
@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [
    DocumentStorageService,
    DocumentLookupService,
    DocumentNotifierService,
    DocumentRoutingService,
    DocumentChainService,
    objectStoreProvider,
  ],
  exports: [
    DocumentStorageService,
    DocumentLookupService,
    DocumentNotifierService,
    DocumentRoutingService,
    DocumentChainService,
    OBJECT_STORE,
  ],
})
export class DocumentCoreModule {}
