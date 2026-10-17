import { combinedServices } from '../../../common/testing/combined-services';
import { CustomersService } from '../customers.service';
import { CustomerWriteService } from '../customer-write.service';
import { CustomerContactsService } from '../customer-contacts.service';
import { CustomerActivitiesService } from '../customer-activities.service';
import { CustomerDueService } from '../customer-due.service';

const CLASSES = [
  CustomersService,
  CustomerWriteService,
  CustomerContactsService,
  CustomerActivitiesService,
  CustomerDueService,
];

/** Every client service as ONE object — the tests were written against the single class it used to be. */
export type CustomerServices = CustomersService &
  CustomerWriteService &
  CustomerContactsService &
  CustomerActivitiesService &
  CustomerDueService;

/** All five services over the same mock database, as one object (`combinedServices`). */
export function customerServices(prisma: unknown): CustomerServices {
  return combinedServices<CustomerServices>(...CLASSES.map((Cls) => new Cls(prisma as never)));
}
