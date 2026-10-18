import { describeBodies } from './body-cases';
import {
  ReviewExpenseDto,
  RejectProposalDto,
  AssetActivityDto,
  AssetMoneyDto,
} from '../../../modules/assets/dto/decision-bodies.dto';
import { AddPartDto, UpdatePartDto } from '../../../modules/reports/dto/part-bodies.dto';
import {
  CustomerDto,
  UpdateCustomerContactDto,
  AddCustomerContactDto,
  AddCustomerActivityDto,
  UpdateCustomerActivityDto,
  InviteCustomerDto,
} from '../../../modules/customers/dto/customer-bodies.dto';
import { UnitBodyDto } from '../../dto/unit-body.dto';
import {
  CreatePortalDto,
  TriageRequestDto,
  UpdatePortalDto,
  CreatePortalCategoryDto,
  UpdatePortalCategoryDto,
  ReorderPortalCategoriesDto,
  InviteResidentDto,
  UpdateSpacePortalDto,
  AssignUnitCustomerDto,
  AssignUnitMemberDto,
  UnitActivityDto,
} from '../../../modules/portal/dto/portal-bodies.dto';

/* Assets, report parts, clients (CRM) and portals — payloads copied from the web, the phone and the inbox. */
const category = {
  portalId: 'p1',
  key: 'leak',
  label: 'Leak',
  icon: 'droplet',
  color: '#00f',
  urgent: true,
  team: 'plumbing',
  defaultPriority: 'HIGH',
  issues: ['Tap'],
  position: 2,
};

describeBodies(
  'records',
  [
    { what: 'an expense accepted from the inbox', dto: ReviewExpenseDto, sends: { decision: 'accept' } },
    { what: 'an expense refused with a note', dto: ReviewExpenseDto, sends: { decision: 'reject', note: 'blurry' } },
    { what: 'a proposal refused', dto: RejectProposalDto, sends: { note: 'not ours' } },
    { what: 'an asset note', dto: AssetActivityDto, sends: { body: 'Tyres changed' } },
    {
      what: 'money on an asset (NaN → null)',
      dto: AssetMoneyDto,
      sends: { category: 'FUEL', amountCents: null, note: 'x' },
    },
    {
      what: 'a part',
      dto: AddPartDto,
      sends: { name: 'Valve', partNumber: 'V1', quantity: 2, unitCost: 3.5, notes: '' },
    },
    { what: 'a part edit', dto: UpdatePartDto, sends: { quantity: 3 } },
    {
      what: 'a client from the web form',
      dto: CustomerDto,
      sends: {
        name: 'BILLA AG',
        email: 'a@b.c',
        phone: '',
        notes: '',
        legalName: '',
        website: '',
        industry: '',
        vatId: '',
        regNumber: '',
        type: 'COMPANY',
        locale: null,
        currency: null,
        details: [{ label: 'Gate', value: '4' }],
        spaceId: 's1',
      },
    },
    {
      what: 'a client from the phone (offline id)',
      dto: CustomerDto,
      sends: { id: 'c-0193', name: 'Anna', type: 'PERSON', spaceId: 's1', locale: 'de' },
    },
    { what: 'a client stage change', dto: CustomerDto, sends: { status: 'WON' } },
    { what: 'managers on a client', dto: CustomerDto, sends: { managerIds: ['u1', 'u2'] } },
    { what: 'a contact made primary', dto: UpdateCustomerContactDto, sends: { isPrimary: true } },
    {
      what: 'a new contact person',
      dto: AddCustomerContactDto,
      sends: { person: { name: 'Ben', email: 'b@c.d' }, role: 'CFO', isPrimary: false },
    },
    {
      what: 'a reminder (phone offline id)',
      dto: AddCustomerActivityDto,
      sends: {
        id: 'a-1',
        type: 'REMINDER',
        body: 'Call',
        dueAt: '2026-10-20T08:00:00Z',
        reminderKind: 'CALL',
        remindBeforeMin: 15,
        reminderAssigneeId: null,
        repeat: 'NONE',
      },
    },
    { what: 'a reminder done', dto: UpdateCustomerActivityDto, sends: { done: true } },
    { what: 'an app invite', dto: InviteCustomerDto, sends: { email: 'a@b.c', portalId: 'p1' } },
    {
      what: 'an address with a pin',
      dto: UnitBodyDto,
      sends: {
        name: 'HQ',
        address: 'Main St 1',
        lat: 47.9,
        lng: 13.8,
        isPrimary: true,
        contactName: null,
        contactPhone: null,
      },
    },
    {
      what: 'a unit with a resident and details',
      dto: UnitBodyDto,
      sends: { name: 'Top 4', residentUserId: null, customerId: 'c1', details: [{ label: 'Floor', value: '2' }] },
    },
    { what: 'a portal from a template', dto: CreatePortalDto, sends: { templateKey: 'apartments', name: 'Residents' } },
    { what: 'triage from the inbox', dto: TriageRequestDto, sends: { spaceId: 's1' } },
    {
      what: 'triage from the phone',
      dto: TriageRequestDto,
      sends: { spaceId: 's1', workflowId: null, priority: 'HIGH', assignedToId: 'u1' },
    },
    {
      what: 'a portal edit',
      dto: UpdatePortalDto,
      sends: { name: 'R', templateKey: 'apartments', reseed: false, spaceId: null },
    },
    { what: 'a category', dto: CreatePortalCategoryDto, sends: category },
    {
      what: 'a category edit (form sent again) + isActive',
      dto: UpdatePortalCategoryDto,
      sends: { ...category, isActive: false },
    },
    { what: 'a reorder', dto: ReorderPortalCategoriesDto, sends: { portalId: 'p1', orderedIds: ['a', 'b'] } },
    {
      what: 'a resident invite',
      dto: InviteResidentDto,
      sends: { portalId: 'p1', name: 'N', email: 'n@x.y', unitName: 'Top 1', unitAddress: 'A' },
    },
    { what: 'the space portal type', dto: UpdateSpacePortalDto, sends: { templateKey: 'offices' } },
    { what: 'a unit given to a client', dto: AssignUnitCustomerDto, sends: { customerId: 'c1' } },
    { what: 'a member moved out', dto: AssignUnitMemberDto, sends: { userId: 'u1', unitId: null } },
    { what: 'a unit note', dto: UnitActivityDto, sends: { body: 'Key handed over' } },
  ],
  [
    { what: 'an unknown decision', dto: ReviewExpenseDto, sends: { decision: 'maybe' } },
    { what: 'a client with an unknown key', dto: CustomerDto, sends: { name: 'x', owner: { id: 'u1' } } },
    { what: 'a reminder offset as words', dto: AddCustomerActivityDto, sends: { remindBeforeMin: 'a quarter' } },
    {
      what: 'a unit with a relation the pick never reads',
      dto: UnitBodyDto,
      sends: { name: 'x', organizationId: 'other-org' },
    },
    {
      what: 'a reorder that is not a list',
      dto: ReorderPortalCategoriesDto,
      sends: { portalId: 'p1', orderedIds: 'a,b' },
    },
  ],
);
