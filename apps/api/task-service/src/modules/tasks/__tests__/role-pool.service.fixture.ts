import { combinedServices } from '../../../common/testing/combined-services';
import { RolePoolService } from '../assignment/role-pool.service';
import { RoleOfferService } from '../assignment/role-offer.service';
import { RoleTakeService } from '../assignment/role-take.service';
import { RoleStatsService } from '../assignment/role-stats.service';
import { RolePoolSweepService } from '../assignment/role-pool-sweep.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of RolePoolService, as ONE object — the tests were written against the single class. */
export type RolePoolServiceParts = Public<RolePoolService> &
  Public<RoleOfferService> &
  Public<RoleTakeService> &
  Public<RoleStatsService> &
  Public<RolePoolSweepService>;

/** Takes the dependencies in the old shared order: prisma, cover, notifications, opening, assignment. */
export function rolePoolServices(...args: unknown[]): RolePoolServiceParts {
  const [prisma, cover, notifications, opening, assignment] = args as any[];
  const offers = new RoleOfferService(prisma, cover, notifications, opening);
  return combinedServices<RolePoolServiceParts>(
    new RolePoolService(prisma, notifications, opening, assignment, offers),
    offers,
    new RoleTakeService(prisma, notifications, assignment),
    new RoleStatsService(prisma),
    new RolePoolSweepService(prisma, notifications, offers),
  );
}
