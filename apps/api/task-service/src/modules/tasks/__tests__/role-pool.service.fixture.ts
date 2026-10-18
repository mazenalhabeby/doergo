import { combinedServices } from '../../../common/testing/combined-services';
import { RolePoolService } from '../role-pool.service';
import { RoleTakeService } from '../role-take.service';
import { RoleStatsService } from '../role-stats.service';
import { RolePoolSweepService } from '../role-pool-sweep.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of RolePoolService, as ONE object — the tests were written against the single class. */
export type RolePoolServiceParts = Public<RolePoolService> &
  Public<RoleTakeService> &
  Public<RoleStatsService> &
  Public<RolePoolSweepService>;

export function rolePoolServices(...args: unknown[]): RolePoolServiceParts {
  return combinedServices<RolePoolServiceParts>(
    new (RolePoolService as unknown as new (...a: unknown[]) => object)(...args),
    new (RoleTakeService as unknown as new (...a: unknown[]) => object)(...args),
    new (RoleStatsService as unknown as new (...a: unknown[]) => object)(...args),
    new (RolePoolSweepService as unknown as new (...a: unknown[]) => object)(...args),
  );
}
