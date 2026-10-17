import { combinedServices } from '../../../common/testing/combined-services';
import { PortalService } from '../portal.service';
import { SpacePortalService } from '../space-portal.service';
import { PortalUnitsService } from '../portal-units.service';
import { UnitWriteService } from '../unit-write.service';
import { PortalClientsService } from '../portal-clients.service';
import { PortalCategoriesService } from '../portal-categories.service';

const CLASSES = [
  PortalService,
  SpacePortalService,
  PortalUnitsService,
  UnitWriteService,
  PortalClientsService,
  PortalCategoriesService,
];

/** Every portal service as ONE object — the tests were written against the single class it used to be. */
export type PortalServices = PortalService &
  SpacePortalService &
  PortalUnitsService &
  UnitWriteService &
  PortalClientsService &
  PortalCategoriesService;

export function portalServices(prisma: unknown, customers: unknown): PortalServices {
  return combinedServices<PortalServices>(...CLASSES.map((Cls) => new Cls(prisma as never, customers as never)));
}
