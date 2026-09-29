import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { EpicsController } from './epics.controller';
import { EpicsService } from './epics.service';

@Module({
  imports: [
  ],
  controllers: [EpicsController],
  providers: [EpicsService],
})
export class EpicsModule {}
