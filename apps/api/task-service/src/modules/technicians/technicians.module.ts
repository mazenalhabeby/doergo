import { Module } from '@nestjs/common';
import { PrismaModule } from '@doergo/shared';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';

@Module({
  imports: [PrismaModule],
  controllers: [TechniciansController],
  providers: [TechniciansService],
  exports: [TechniciansService],
})
export class TechniciansModule {}
