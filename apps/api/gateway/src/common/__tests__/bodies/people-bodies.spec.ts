import { describeBodies } from './body-cases';
import {
  CreateSpaceRoleDto,
  UpdateSpaceRoleDto,
  AssignSpaceMemberDto,
  MemberRoutingDto,
} from '../../../modules/space-roles/dto/role-bodies.dto';
import {
  CreateShiftDto,
  UpdateShiftDto,
  SetRotaDayDto,
  CreateRotaDto,
  UpdateRotaDto,
} from '../../../modules/shifts/dto/shift-bodies.dto';
import {
  ApproveTimeOffDto,
  AddTimeOffDto,
  UpdateTimeOffDto,
  MatchLeaveOpeningDto,
  SaveLeaveOpeningDto,
  LeaveAdjustmentDto,
  SetScheduleDto,
} from '../../../modules/technicians/dto/leave-bodies.dto';
import {
  LeavePolicyDto,
  ProfileBadgesDto,
  MemberWatchersDto,
  CreateOrgRoleDto,
  UpdateOrgRoleDto,
} from '../../../modules/organizations/dto/org-bodies.dto';
import { validateBody } from '../../testing/validate-body';

/* People, roles, rota and leave — payloads copied from the web dialogs, the phone and the inbox. */
const shift = {
  spaceId: 's1',
  name: 'Early',
  description: '',
  color: '#2563eb',
  startLocal: '06:00',
  endLocal: '14:00',
  breakMinutes: 30,
  graceMin: 15,
  reminderIntervalMin: 15,
  maxReminders: 3,
  flagToleranceMin: 10,
};
const rota = {
  userId: 'u1',
  shiftId: 'sh1',
  recurrence: 'WEEKLY',
  daysOfWeek: [1, 2, 3],
  daysOfMonth: [],
  dates: [],
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  priority: 0,
};

describeBodies(
  'people',
  [
    {
      what: 'a work role from a workspace',
      dto: CreateSpaceRoleDto,
      sends: { name: 'Mechanic', color: '#000', kind: 'WORK', spaceId: 's1' },
    },
    {
      what: 'a management role with permissions',
      dto: UpdateSpaceRoleDto,
      sends: { name: 'Lead', kind: 'MANAGEMENT', permissions: { canManageRota: true } },
    },
    { what: 'assign a member, no role', dto: AssignSpaceMemberDto, sends: { userId: 'u1', spaceRoleId: null } },
    {
      what: 'routing (six lists)',
      dto: MemberRoutingDto,
      sends: {
        notifyUserIds: ['a'],
        notifyRoleIds: [],
        contactUserIds: [],
        contactRoleIds: [],
        approveUserIds: [],
        approveRoleIds: [],
      },
    },
    { what: 'a new shift', dto: CreateShiftDto, sends: shift },
    { what: 'a shift edit (re-sends spaceId) + isActive', dto: UpdateShiftDto, sends: { ...shift, isActive: false } },
    {
      what: "the phone's rota day",
      dto: SetRotaDayDto,
      sends: { spaceId: 's1', userId: 'u1', date: '2026-10-20', shiftId: null, repeat: 'weekly' },
    },
    { what: 'a rota row', dto: CreateRotaDto, sends: rota },
    { what: 'a rota edit (re-sends userId) + isActive', dto: UpdateRotaDto, sends: { ...rota, isActive: true } },
    { what: 'leave approved from the inbox', dto: ApproveTimeOffDto, sends: { approved: true } },
    {
      what: 'leave refused with a reason',
      dto: ApproveTimeOffDto,
      sends: { approved: false, rejectionReason: 'busy' },
    },
    {
      what: 'a day off added by the office',
      dto: AddTimeOffDto,
      sends: { technicianId: 'u1', startDate: '2026-10-20', endDate: '2026-10-21', reason: 'x' },
    },
    { what: 'a day off edited', dto: UpdateTimeOffDto, sends: { startDate: '2026-10-20', reason: null } },
    { what: 'a pasted table', dto: MatchLeaveOpeningDto, sends: { text: 'a@b.c\t3\t2' } },
    {
      what: 'starting balances',
      dto: SaveLeaveOpeningDto,
      sends: { on: '2026-01-01', rows: [{ userId: 'u1', used: 3, carried: 2 }] },
    },
    {
      what: 'an adjustment, days as typed "1,5"',
      dto: LeaveAdjustmentDto,
      sends: { kind: 'GRANTED', days: '1,5', on: '2026-10-01', reason: null },
    },
    {
      what: 'a weekly schedule',
      dto: SetScheduleDto,
      sends: { schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '16:00', isActive: true }] },
    },
    {
      what: 'the leave policy (numbers as sent)',
      dto: LeavePolicyDto,
      sends: { defaultLeaveAllowance: 25, leaveYearMode: 'CALENDAR', carryOverMode: 'UP_TO', carryOverMaxDays: 5 },
    },
    { what: 'badges', dto: ProfileBadgesDto, sends: { showRole: true, showType: false, showSpecialty: true } },
    { what: 'watchers', dto: MemberWatchersDto, sends: { watcherIds: ['u2'] } },
    {
      what: 'an org role',
      dto: CreateOrgRoleDto,
      sends: { name: 'Clerk', description: undefined, color: '#111', permissions: { canViewReports: true } },
    },
    { what: 'an org role edit', dto: UpdateOrgRoleDto, sends: { name: 'Clerk 2', permissions: {} } },
  ],
  [
    { what: 'an unknown key on a rota edit', dto: UpdateRotaDto, sends: { ...rota, spaceName: 'x' } },
    {
      what: 'a permissions list instead of an object',
      dto: CreateSpaceRoleDto,
      sends: { name: 'x', permissions: ['canManageRota'] },
    },
    { what: 'a routing id that is not a string', dto: MemberRoutingDto, sends: { notifyUserIds: [5] } },
    {
      what: 'repeat "monthly"',
      dto: SetRotaDayDto,
      sends: { spaceId: 's', userId: 'u', date: 'd', repeat: 'monthly' },
    },
    { what: 'approved as an object', dto: ApproveTimeOffDto, sends: { approved: { yes: true } } },
  ],
);

describe('people bodies — values kept as the parsers need them', () => {
  it('a leave adjustment keeps "1,5" as text (parseLeaveAdjustment reads the comma)', async () => {
    const r = await validateBody(LeaveAdjustmentDto, { kind: 'GRANTED', days: '1,5' });
    expect(r).toEqual({ ok: true, body: expect.objectContaining({ days: '1,5' }) });
  });
  it('the leave policy keeps a typed number as typed (parseLeavePolicy answers the coded refusal)', async () => {
    const r = await validateBody(LeavePolicyDto, { defaultLeaveAllowance: 'abc' });
    expect(r).toEqual({ ok: true, body: expect.objectContaining({ defaultLeaveAllowance: 'abc' }) });
  });
});
