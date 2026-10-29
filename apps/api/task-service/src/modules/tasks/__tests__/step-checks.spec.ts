import { BadRequestException } from '@nestjs/common';
import { stepArrives, stepHoldsSlot, stepNeedsSite, stepSetsOff, slotKeysOf } from '../status/step-checks';
import { assertAtJobSite, assertNoOtherActiveTask } from '../status/task-status-checks';

/*
  The site, due-date and one-at-a-time checks fired on ARRIVED / IN_PROGRESS,
  EN_ROUTE and ACCEPTED by NAME, so a job on the organization's own flow skipped
  all three. They now key on the step's capabilities, as the clock gate does.
*/
const VISITS = {
  name: 'Visits',
  statuses: [
    { key: 'TODO', capabilities: [] },
    { key: 'DRIVING', capabilities: ['gps', 'timer'] },
    { key: 'ON_SITE', capabilities: ['timer'] },
    { key: 'PAUSED', capabilities: [] },
    { key: 'WRAPPED', capabilities: ['photos'] },
  ],
};
const OFFICE = {
  name: 'Office',
  statuses: [
    { key: 'TODO', capabilities: [] },
    { key: 'DOING', capabilities: ['timer'] },
  ],
};

describe('which moves the execution checks ask about', () => {
  it('the built-in flow answers exactly as the names did', () => {
    expect(stepSetsOff(null, 'EN_ROUTE')).toBe(true);
    for (const k of ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'BLOCKED']) expect(stepSetsOff(null, k)).toBe(false);
    expect(stepNeedsSite(null, 'ARRIVED')).toBe(true);
    expect(stepNeedsSite(null, 'IN_PROGRESS')).toBe(true);
    for (const k of ['ACCEPTED', 'EN_ROUTE', 'BLOCKED', 'COMPLETED']) expect(stepNeedsSite(null, k)).toBe(false);
    expect(stepArrives(null, 'EN_ROUTE')).toBe(true);
    expect(stepArrives(null, 'ARRIVED')).toBe(false);
    for (const k of ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) expect(stepHoldsSlot(null, k)).toBe(true);
    expect(stepHoldsSlot(null, 'BLOCKED')).toBe(false);
  });

  it('a custom flow gets the same checks on its own steps', () => {
    expect(stepSetsOff(VISITS, 'DRIVING')).toBe(true);
    expect(stepNeedsSite(VISITS, 'ON_SITE')).toBe(true);
    expect(stepArrives(VISITS, 'DRIVING')).toBe(true);
    expect(stepHoldsSlot(VISITS, 'ON_SITE')).toBe(true);
    expect(stepHoldsSlot(VISITS, 'PAUSED')).toBe(false);
    expect(slotKeysOf([VISITS])).toEqual(expect.arrayContaining(['DRIVING', 'ON_SITE', 'ACCEPTED']));
  });

  it('a flow with no travel step never asks where the person is', () => {
    expect(stepNeedsSite(OFFICE, 'DOING')).toBe(false);
    expect(stepSetsOff(OFFICE, 'DOING')).toBe(false);
  });
});

describe('the checks on a custom flow', () => {
  const job = (over: Record<string, unknown> = {}) =>
    ({ id: 't1', organizationId: 'org', spaceId: null, workflowId: 'visits', status: 'DRIVING', ...over }) as any;

  it('arriving ON_SITE far from the pin is refused like ARRIVED', async () => {
    const prisma: any = { companyLocation: { findUnique: jest.fn() } };
    const data: any = { status: 'ON_SITE', lat: 48.2, lng: 16.3, accuracy: 5 };
    const err = await assertAtJobSite(
      prisma,
      job({ locationLat: 48.0, locationLng: 16.3 }),
      data,
      new Date(),
      [],
      VISITS,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'TOO_FAR_TO_ARRIVE' });
  });

  it('starting DOING while another job is ON_SITE is refused; a WRAPPED one holds nothing', async () => {
    const build = (otherStatus: string) => {
      const prisma: any = {
        task: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { title: 'Boiler', status: otherStatus, organizationId: 'org', workflowId: 'visits', spaceId: null },
            ]),
        },
      };
      const workflows = {
        getOrgWorkflows: jest.fn().mockResolvedValue([VISITS, OFFICE]),
        getWorkflow: jest.fn().mockResolvedValue(VISITS),
      };
      return { prisma, workflows };
    };
    const todo = job({ status: 'TODO', workflowId: 'office' });
    const busy = build('ON_SITE');
    await expect(
      assertNoOtherActiveTask(busy.prisma, busy.workflows as any, todo, OFFICE, 'DOING', 'u'),
    ).rejects.toThrow('You already have an active task: "Boiler"');
    expect(busy.prisma.task.findMany.mock.calls[0][0].where.status.in).toEqual(
      expect.arrayContaining(['ON_SITE', 'DOING']),
    );
    const done = build('WRAPPED');
    await expect(
      assertNoOtherActiveTask(done.prisma, done.workflows as any, todo, OFFICE, 'DOING', 'u'),
    ).resolves.toBeUndefined();
  });

  it('a move inside the slot (already holding it) asks nothing', async () => {
    const prisma: any = { task: { findMany: jest.fn() } };
    await assertNoOtherActiveTask(prisma, {} as any, job({ status: 'DRIVING' }), VISITS, 'ON_SITE', 'u');
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
