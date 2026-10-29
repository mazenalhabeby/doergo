import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
// The CRM address routes reuse the CRM's own reach rule (CustomersService).
import { CustomersModule } from '../customers/customers.module';
import { SpacePortalService } from './space-portal.service';
import { PortalUnitsService } from './portal-units.service';
import { UnitWriteService } from './unit-write.service';
import { PortalClientsService } from './portal-clients.service';
import { PortalCategoriesService } from './portal-categories.service';
import { PortalReachService } from './portal-reach.service';
import { UnitResidentsService } from './unit-residents.service';
import { PortalAdmitService } from './portal-admit.service';

@Module({
  imports: [CustomersModule],
  controllers: [PortalController],
  providers: [
    PortalService,
    SpacePortalService,
    PortalUnitsService,
    UnitWriteService,
    PortalClientsService,
    PortalCategoriesService,
    PortalReachService,
    UnitResidentsService,
    PortalAdmitService,
  ],
  exports: [
    PortalService,
    SpacePortalService,
    PortalUnitsService,
    UnitWriteService,
    PortalClientsService,
    PortalCategoriesService,
  ],
})
export class PortalModule {}
