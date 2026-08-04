import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

// SERVICE_NAMES.TASK ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
