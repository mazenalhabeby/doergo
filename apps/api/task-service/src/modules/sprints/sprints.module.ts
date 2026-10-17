import { Module } from '@nestjs/common';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { SprintReportsService } from './sprint-reports.service';

@Module({
  controllers: [SprintsController],
  providers: [SprintsService, SprintReportsService],
  exports: [SprintsService],
})
export class SprintsModule {}
