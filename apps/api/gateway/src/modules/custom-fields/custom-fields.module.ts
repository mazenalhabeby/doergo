import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { CustomFieldsController, TaskCustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

@Module({
  imports: [
  ],
  controllers: [CustomFieldsController, TaskCustomFieldsController],
  providers: [CustomFieldsService],
})
export class CustomFieldsModule {}
