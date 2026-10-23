import { combinedServices } from '../../../common/testing/combined-services';
import { PortalService } from '../portal.service';
import { SpacePortalService } from '../space-portal.service';
import { PortalUnitsService } from '../portal-units.service';
import { UnitWriteService } from '../unit-write.service';
import { PortalClientsService } from '../portal-clients.service';
import { PortalCategoriesService } from '../portal-categories.service';
import { PortalReachService } from '../portal-reach.service';
import { UnitResidentsService } from '../unit-residents.service';

/** Only the public surface — the classes each hold their own private collaborators. */
type Public<T> = { [K in keyof T]: T[K] };

/** Every portal service as ONE object — the tests were written against the single class it used to be. */
export type PortalServices = Public<PortalService> &
  Public<SpacePortalService> &
  Public<PortalUnitsService> &
  Public<UnitWriteService> &
  Public<PortalClientsService> &
  Public<PortalCategoriesService>;

/** The portal providers wired by hand, the way Nest wires them in PortalModule. */
export function portalServices(prisma: unknown, customers: unknown): PortalServices {
  const db = prisma as never;
  const reach = new PortalReachService(db, customers as never);
  const residents = new UnitResidentsService(db);
  const portals = new PortalService(db, reach);
  return combinedServices<PortalServices>(
    portals,
    new SpacePortalService(db, reach, portals, residents),
    new PortalUnitsService(db, reach, residents),
    new UnitWriteService(db, reach, residents),
    new PortalClientsService(db),
    new PortalCategoriesService(db, reach),
  );
}
