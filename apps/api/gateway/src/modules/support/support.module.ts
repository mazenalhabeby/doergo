import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

// The SERVICE_NAMES.TASK ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
