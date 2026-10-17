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

/** The same, from a Nest test module that registered them all. */
export function rolePoolServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): RolePoolServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [RolePoolService, RoleTakeService, RoleStatsService, RolePoolSweepService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<RolePoolServiceParts>(...parts);
}
