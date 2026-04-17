import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
