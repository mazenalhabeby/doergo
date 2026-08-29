import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsGatewayService } from './documents.service';

/**
 * AUTH_SERVICE is registered globally in app.module, as it is for every other
 * gateway module — this contributes the routes and the client wrapper that maps
 * RPC errors back to real HTTP statuses.
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsGatewayService],
})
export class DocumentsModule {}
