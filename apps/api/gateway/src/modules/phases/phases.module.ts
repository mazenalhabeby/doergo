import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { PhasesController } from './phases.controller';
import { PhasesService } from './phases.service';

@Module({
  imports: [
  ],
  controllers: [PhasesController],
  providers: [PhasesService],
})
export class PhasesModule {}
