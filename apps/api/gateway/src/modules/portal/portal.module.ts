import { Module } from '@nestjs/common';
import { CustomerScopeGuard } from '../../common/guards/customer-scope.guard';
import { TasksModule } from '../tasks/tasks.module';
import { PortalController } from './portal.controller';
import { PortalAdminController } from './portal-admin.controller';
import { PortalSetupController } from './portal-setup.controller';
import { PortalResidentsController } from './portal-residents.controller';
import { SpacePortalController } from './space-portal.controller';
import { SpaceUnitsController, UnitDetailController } from './space-units.controller';
import { PortalAdminCalls } from './portal-admin-calls';

@Module({
  imports: [TasksModule], // reuse TasksQueueService (exported) for request creation
  controllers: [
    PortalController,
    PortalAdminController,
    PortalSetupController,
    PortalResidentsController,
    SpacePortalController,
    SpaceUnitsController,
    UnitDetailController,
  ],
  providers: [CustomerScopeGuard, PortalAdminCalls],
})
export class PortalModule {}
