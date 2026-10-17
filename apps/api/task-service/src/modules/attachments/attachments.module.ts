import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentFilesService } from './attachment-files.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentFilesService],
  exports: [AttachmentsService, AttachmentFilesService],
})
export class AttachmentsModule {}
