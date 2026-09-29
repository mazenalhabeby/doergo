import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { CustomFieldsController, TaskCustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

@Module({
  imports: [
  ],
  controllers: [CustomFieldsController, TaskCustomFieldsController],
  providers: [CustomFieldsService],
})
export class CustomFieldsModule {}
