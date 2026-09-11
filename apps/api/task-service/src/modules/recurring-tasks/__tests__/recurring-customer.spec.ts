/**
 * A repeating visit remembers which client it repeats for.
 *
 * ⚠️ A ONE-OFF VISIT HAS CARRIED `customerId` SINCE CLIENT VISITS SHIPPED, AND
 * A REPEATING ONE DID NOT. So the commonest visit of all — the monthly service
 * call to a customer — generated tasks with the right address on them and no
 * client, and "what have we done for this client" answered with one-offs only.
 * Nothing on screen suggested anything was missing: the tasks looked complete,
 * because an address is what a technician needs and the link is what the office
 * needs.
 *
 * Caught by `create-task-dialog.payload.spec.ts`, which asserts that nothing
 * the dialog collects is thrown away. It had been failing.
 */
import { Test } from '@nestjs/testing';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RecurringTasksService } from '../recurring-tasks.service';

describe('RecurringTasksService — the client survives the repeat', () => {
  let service: RecurringTasksService;

  const prisma: Record<string, any> = {
    recurringTaskTemplate: {
      create: jest.fn(), update: jest.fn(),
      findUnique: jest.fn(), findFirst: jest.fn(),
    },
    task: { create: jest.fn() },
    checklistItem: { createMany: jest.fn() },
    taskAssignee: { createMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        RecurringTasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(RecurringTasksService);
  });

  const base = {
    title: 'Monthly service call',
    organizationId: 'org1',
    createdById: 'u1',
    frequency: 'MONTHLY',
    // MONTHLY insists on a day; the service validates before it writes.
    dayOfMonth: 1,
    startDate: '2026-10-01T00:00:00.000Z',
  };

  it('stores the client on the template', async () => {
    prisma.recurringTaskTemplate.create.mockResolvedValue({ id: 'rt1' });
    await service.create({ ...base, customerId: 'cust1' } as any);

    expect(prisma.recurringTaskTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: 'cust1' }) }),
    );
  });

  it('stores null when the repeat is not for a client', async () => {
    // An internal repeating job is not a visit, and must not carry a stale id.
    prisma.recurringTaskTemplate.create.mockResolvedValue({ id: 'rt1' });
    await service.create({ ...base } as any);

    expect(prisma.recurringTaskTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: null }) }),
    );
  });

  it('tells "no longer for this client" apart from "not mentioned"', async () => {
    /*
      `undefined` must leave the column alone; an explicit null must clear it.
      Collapsing the two is how an edit that changes only the title silently
      unlinks the customer.
    */
    prisma.recurringTaskTemplate.findUnique.mockResolvedValue({ id: 'rt1', organizationId: 'org1' });
    prisma.recurringTaskTemplate.update.mockResolvedValue({ id: 'rt1' });

    await service.update({ id: 'rt1', organizationId: 'org1', customerId: null } as any);
    expect(prisma.recurringTaskTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: null }) }),
    );

    jest.clearAllMocks();
    prisma.recurringTaskTemplate.findUnique.mockResolvedValue({ id: 'rt1', organizationId: 'org1' });
    prisma.recurringTaskTemplate.update.mockResolvedValue({ id: 'rt1' });
    await service.update({ id: 'rt1', organizationId: 'org1', title: 'Renamed' } as any);
    const data = prisma.recurringTaskTemplate.update.mock.calls[0][0].data;
    expect('customerId' in data).toBe(false);
  });
});
