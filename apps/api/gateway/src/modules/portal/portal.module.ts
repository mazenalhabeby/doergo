import { Module } from '@nestjs/common';
import { CustomerScopeGuard } from '../../common/guards/customer-scope.guard';
import { TasksModule } from '../tasks/tasks.module';
import { PortalController } from './portal.controller';
import { PortalAdminController } from './portal-admin.controller';
import { SpacePortalController } from './space-portal.controller';
import { SpaceUnitsController } from './space-units.controller';

@Module({
  imports: [TasksModule], // reuse TasksQueueService (exported) for request creation
  controllers: [PortalController, PortalAdminController, SpacePortalController, SpaceUnitsController],
  providers: [CustomerScopeGuard],
})
export class PortalModule {}
