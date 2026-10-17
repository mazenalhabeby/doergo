import { Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldValuesService } from './custom-field-values.service';

@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService, CustomFieldValuesService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
