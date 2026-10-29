import { noOfficeRules } from '../../approvals/__tests__/no-office-rules';
/**
 * The time-off request as a general request (requests/request-kinds.ts), on the server:
 * one parser, coded refusals, the workspace's own list of kinds, and a remote day only where
 * the member may work away — the same `resolveAwayAccess` the clock-in decides by.
 */
import { TimeOffRequestService } from '../time-off-request.service';
import { TimeOffDecisionService } from '../time-off-decision.service';

const SITE = { lat: 47.98, lng: 13.83 };
const space = (over: Record<string, unknown> = {}) => ({
  id: 'office',
  name: 'Main Office',
  ...SITE,
  geofencePolicy: 'AWAY_ALLOWED',
  requestKinds: [],
  ...over,
});

function build(
  opts: {
    member?: Record<string, unknown> | null;
    assignments?: Array<{ allowRemote: boolean | null; space: Record<string, unknown> }>;
    clashes?: any[];
    foreignSpace?: { organizationId: string } | null;
    zone?: string;
  } = {},
) {
  const prisma: any = {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.member === undefined ? { id: 'mike', allowRemote: true, role: 'EMPLOYEE' } : opts.member,
        ),
      findUnique: jest.fn().mockResolvedValue({ timezone: opts.zone ?? null, organization: null, spaceAssignments: [] }),
    },
    spaceAssignment: {
      findMany: jest.fn().mockResolvedValue(opts.assignments ?? [{ allowRemote: null, space: space() }]),
    },
    companyLocation: { findFirst: jest.fn().mockResolvedValue(opts.foreignSpace ?? null) },
    timeOff: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(opts.clashes ?? []),
      create: jest.fn(async ({ data }: any) => ({
        id: 'r1',
        ...data,
        technician: { id: 'mike', firstName: 'Mike', lastName: 'Weber' },
        space: data.spaceId ? { id: data.spaceId, name: 'Main Office' } : null,
      })),
    },
  };
  const routing = { resolveWatchers: jest.fn().mockResolvedValue({ ids: ['anna'], emails: [] }) };
  const cover = { assessMany: jest.fn().mockResolvedValue(new Map()) };
  const calendarRules = { countLeaveFor: jest.fn().mockResolvedValue({ counted: 3 }) };
  const notify = { emit: jest.fn() };
  const decisions = new TimeOffDecisionService(
    prisma,
    cover as any,
    calendarRules as any,
    notify as any,
    noOfficeRules(),
  );
  const service = new TimeOffRequestService(
    prisma,
    routing as any,
    cover as any,
    calendarRules as any,
    notify as any,
    decisions,
  );
  return { service, prisma, cover, calendarRules, notify };
}

const ask = (body: Record<string, unknown>) => ({ technicianId: 'mike', organizationId: 'org1', ...body }) as any;
const FUTURE = '2099-11-14';
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: any) => e?.response?.code ?? e?.status ?? String(e),
  );

describe('requests — validation and refusals', () => {
  it('refuses what the shared parser refuses, with its code', async () => {
    const { service } = build();
    expect(await code(service.requestTimeOff(ask({ kind: 'NAP', startDate: FUTURE })))).toBe('REQUEST_KIND_INVALID');
    expect(await code(service.requestTimeOff(ask({ kind: 'REMOTE', startDate: FUTURE })))).toBe(
      'REQUEST_SPACE_REQUIRED',
    );
    expect(await code(service.requestTimeOff(ask({ kind: 'OVERTIME', startDate: FUTURE, minutes: 5 })))).toBe(
      'REQUEST_MINUTES_INVALID',
    );
  });

  it('refuses a remote day where the member may not work away (a STRICT site)', async () => {
    const { service, prisma } = build({
      assignments: [{ allowRemote: null, space: space({ geofencePolicy: 'STRICT' }) }],
    });
    expect(await code(service.requestTimeOff(ask({ kind: 'REMOTE', spaceId: 'office', startDate: FUTURE })))).toBe(
      'REQUEST_REMOTE_NOT_ALLOWED',
    );
    expect(prisma.timeOff.create).not.toHaveBeenCalled();
  });

  it('refuses a remote day for a member without the grant, and one the assignment overrides off', async () => {
    expect(
      await code(
        build({ member: { id: 'mike', allowRemote: false, role: 'EMPLOYEE' } }).service.requestTimeOff(
          ask({ kind: 'REMOTE', spaceId: 'office', startDate: FUTURE }),
        ),
      ),
    ).toBe('REQUEST_REMOTE_NOT_ALLOWED');
    expect(
      await code(
        build({ assignments: [{ allowRemote: false, space: space() }] }).service.requestTimeOff(
          ask({ kind: 'REMOTE', spaceId: 'office', startDate: FUTURE }),
        ),
      ),
    ).toBe('REQUEST_REMOTE_NOT_ALLOWED');
  });

  it('a workspace they are not assigned to: 400 in this organization, 404 for another one', async () => {
    const mine = build({ foreignSpace: { organizationId: 'org1' } });
    expect(
      await code(mine.service.requestTimeOff(ask({ kind: 'REMOTE', spaceId: 'warehouse', startDate: FUTURE }))),
    ).toBe('REQUEST_SPACE_NOT_YOURS');
    const theirs = build({ foreignSpace: { organizationId: 'other-org' } });
    expect(
      await code(theirs.service.requestTimeOff(ask({ kind: 'REMOTE', spaceId: 'warehouse', startDate: FUTURE }))),
    ).toBe(404);
  });

  it('refuses a kind the workspace does not take — and with no workspace named, when none of theirs takes it', async () => {
    const { service } = build({
      assignments: [{ allowRemote: null, space: space({ requestKinds: ['LEAVE', 'REMOTE'] }) }],
    });
    expect(
      await code(
        service.requestTimeOff(ask({ kind: 'HOURS', spaceId: 'office', startDate: FUTURE, startTime: '10:00' })),
      ),
    ).toBe('REQUEST_KIND_NOT_OFFERED');
    expect(await code(service.requestTimeOff(ask({ kind: 'OVERTIME', startDate: FUTURE, minutes: 60 })))).toBe(
      'REQUEST_KIND_NOT_OFFERED',
    );
  });

  it('refuses a remote day that falls in leave', async () => {
    const { service } = build({
      clashes: [
        {
          kind: 'LEAVE',
          startDate: new Date(`${FUTURE}T00:00:00Z`),
          endDate: new Date(`${FUTURE}T00:00:00Z`),
          status: 'APPROVED',
        },
      ],
    });
    expect(await code(service.requestTimeOff(ask({ kind: 'REMOTE', spaceId: 'office', startDate: FUTURE })))).toBe(
      'REQUEST_OVERLAPS_LEAVE',
    );
  });

  it('leave collides with leave only', async () => {
    const { service, prisma } = build();
    await service.requestTimeOff(ask({ startDate: FUTURE, endDate: FUTURE }));
    expect(prisma.timeOff.findMany.mock.calls[0][0].where.kind).toEqual({ in: ['LEAVE'] });
  });
});

describe('requests — what is stored and said', () => {
  it('stores a remote day with its workspace, costs no allowance and asks no cover verdict', async () => {
    const { service, prisma, cover, calendarRules, notify } = build();
    const res: any = await service.requestTimeOff(
      ask({ kind: 'REMOTE', spaceId: 'office', startDate: FUTURE, endDate: FUTURE }),
    );
    const data = prisma.timeOff.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ kind: 'REMOTE', spaceId: 'office', workingDays: null, status: 'PENDING' });
    expect(calendarRules.countLeaveFor).not.toHaveBeenCalled();
    expect(cover.assessMany).not.toHaveBeenCalled();
    expect(res.data.space).toEqual({ id: 'office', name: 'Main Office' });
    // The notification names the kind and the workspace.
    expect(notify.emit).toHaveBeenCalledWith(
      'time_off_requested',
      expect.objectContaining({ kind: 'REMOTE', spaceName: 'Main Office' }),
    );
  });

  it('a changed day may be about TODAY; leave from today is still "in the past"', async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(await code(build().service.requestTimeOff(ask({ kind: 'HOURS', startDate: today, endTime: '18:00' })))).toBe(
      'ok',
    );
    expect(await code(build().service.requestTimeOff(ask({ startDate: today })))).toBe('REQUEST_IN_PAST');
  });

  it('"today" is the MEMBER\'s day: 23:30 UTC is already tomorrow in Riyadh', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date('2026-11-02T22:30:00Z'));
    try {
      const hours = (startDate: string) => ask({ kind: 'HOURS', startDate, endTime: '18:00' });
      const riyadh = () => build({ zone: 'Asia/Riyadh' }).service;
      expect(await code(riyadh().requestTimeOff(hours('2026-11-02')))).toBe('REQUEST_IN_PAST');
      expect(await code(riyadh().requestTimeOff(hours('2026-11-03')))).toBe('ok');
      // Leave from the member's today is past too; from their tomorrow it is fine.
      expect(await code(riyadh().requestTimeOff(ask({ startDate: '2026-11-03' })))).toBe('REQUEST_IN_PAST');
      expect(await code(riyadh().requestTimeOff(ask({ startDate: '2026-11-04' })))).toBe('ok');
      // In New York it is still the 2nd.
      const ny = build({ zone: 'America/New_York' }).service;
      expect(await code(ny.requestTimeOff(hours('2026-11-02')))).toBe('ok');
    } finally {
      jest.useRealTimers();
    }
  });

  it('old phones (no kind) still ask for vacation leave, counted in working days', async () => {
    const { service, prisma, calendarRules } = build();
    await service.requestTimeOff(ask({ startDate: FUTURE, endDate: FUTURE }));
    expect(prisma.timeOff.create.mock.calls[0][0].data).toMatchObject({
      kind: 'LEAVE',
      type: 'VACATION',
      workingDays: 3,
    });
    expect(calendarRules.countLeaveFor).toHaveBeenCalled();
  });
});

describe('requests — the caller’s options', () => {
  it('lists the kinds offered and where a remote day may be asked — never a STRICT or pin-less site', async () => {
    const { service } = build({
      assignments: [
        { allowRemote: null, space: space() },
        {
          allowRemote: null,
          space: space({ id: 'yard', name: 'Yard', geofencePolicy: 'STRICT', requestKinds: ['LEAVE', 'REMOTE'] }),
        },
        { allowRemote: null, space: space({ id: 'cloud', name: 'Project', lat: null, lng: null }) },
      ],
    });
    const res: any = await service.requestOptions({ userId: 'mike', organizationId: 'org1' });
    expect(res.data.kinds).toEqual(['LEAVE', 'REMOTE', 'HOURS', 'OVERTIME', 'OTHER']);
    expect(res.data.remoteSpaces).toEqual([{ id: 'office', name: 'Main Office' }]);
  });

  it('a member in no workspace may ask for everything but a remote day', async () => {
    const { service } = build({ assignments: [] });
    const res: any = await service.requestOptions({ userId: 'mike', organizationId: 'org1' });
    expect(res.data).toEqual({ kinds: ['LEAVE', 'HOURS', 'OVERTIME', 'OTHER'], remoteSpaces: [] });
  });

  it('somebody not in this organization: 404', async () => {
    expect(await code(build({ member: null }).service.requestOptions({ userId: 'x', organizationId: 'org1' }))).toBe(
      404,
    );
  });
});
