import { combinedServices } from '../../../common/testing/combined-services';
import { CustomersService } from '../customers.service';
import { CustomerWriteService } from '../customer-write.service';
import { CustomerContactsService } from '../customer-contacts.service';
import { CustomerActivitiesService } from '../customer-activities.service';
import { CustomerDueService } from '../customer-due.service';
import { CrmReachService } from '../crm-reach.service';
import { CustomerRefsService } from '../customer-refs.service';

/** Only the public surface — the classes each hold their own private collaborators. */
type Public<T> = { [K in keyof T]: T[K] };

/** Every client service as ONE object — the tests were written against the single class it used to be. */
export type CustomerServices = Public<CustomersService> &
  Public<CustomerWriteService> &
  Public<CustomerContactsService> &
  Public<CustomerActivitiesService> &
  Public<CustomerDueService>;

/**
 * All five services over the same mock database, as one object (`combinedServices`), wired the way
 * CustomersModule wires them. The shared collaborators are in the list too, so a test that replaces
 * one of their methods on the combined object (`crmReachFor`, `assertCrmReach`, `clientCompany`, …)
 * replaces it where the services actually call it.
 */
export function customerServices(prisma: unknown): CustomerServices {
  const db = prisma as never;
  const reach = new CrmReachService(db);
  const refs = new CustomerRefsService(db);
  return combinedServices<CustomerServices>(
    new CustomersService(db, reach),
    new CustomerWriteService(db, reach, refs),
    new CustomerContactsService(db, reach),
    new CustomerActivitiesService(db, reach, refs),
    new CustomerDueService(db, reach),
    reach,
    refs,
  );
}
