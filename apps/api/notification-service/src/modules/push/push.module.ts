import { Module } from '@nestjs/common';
import { PrismaModule } from '@doergo/shared';
import { PushService } from './push.service';

@Module({
  imports: [PrismaModule],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
