import { describeBodies } from './body-cases';
import {
  RunReportDto,
  CreateSavedReportDto,
  UpdateSavedReportDto,
  CreateReportScheduleDto,
  UpdateReportScheduleDto,
} from '../../../modules/analytics/dto/analytics-bodies.dto';
import { AppUpdateNotifyDto } from '../../../modules/app-version/dto/notify.dto';
import { AdminOrgAddOnsDto } from '../../../modules/billing/dto/admin-add-ons.dto';
import { AttachSpaceWorkflowDto } from '../../../modules/workflows/dto/attach.dto';
import {
  LinkOpenDto,
  LinkFileDto,
  LinkSubmitDto,
  LinkResendDto,
  ExportDocumentsDto,
  VerifyDocumentDto,
} from '../../../modules/documents/dto/link-bodies.dto';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceStatusDto,
  InvoiceItemDto,
} from '../../../modules/invoices/dto/invoice-bodies.dto';
import {
  CreateShareDto,
  UpdateShareDto,
  ResolveShareRequestDto,
  RespondToShareDto,
  CreateShareRequestDto,
} from '../../../modules/space-sharing/dto/share-bodies.dto';
import { BiometricEnrollDto, BiometricChallengeDto, BiometricVerifyDto } from '../../../modules/auth/dto/biometric.dto';
import { CreateBlogPostDto, BlogImageDto } from '../../../modules/blog/dto/blog-bodies.dto';
import {
  StaffLoginDto,
  StaffCodeDto,
  StaffCreateDto,
  StaffPatchDto,
  AgreedPriceDto,
  BillingModeDto,
  SupportReplyDto,
  SupportAssignDto,
  SupportTeamUpdateDto,
  SupportTeamMemberDto,
  SupportRuleDto,
  PinOrgDto,
  LibraryTemplateDto,
  LibraryImportDto,
} from '../../../modules/platform-admin/dto/platform-bodies.dto';

/* Reports, invoices, documents, sharing, sign-in and the operator console — payloads from their clients. */
const definition = { dataset: 'tasks', columns: ['title'], filters: [] };
const line = {
  description: 'Labour',
  quantity: 8,
  unitPrice: 45,
  taskId: null,
  lineKind: 'HOURS',
  workerId: 'u1',
  dayFrom: '2026-10-01',
  dayTo: '2026-10-31',
  taskIds: ['t1'],
  billRateCents: 4500,
  costRateCents: 3000,
  billedHours: 8,
  hoursBasis: 'COUNTED',
};

describeBodies(
  'office',
  [
    { what: 'a report run', dto: RunReportDto, sends: { definition } },
    { what: 'a saved report', dto: CreateSavedReportDto, sends: { name: 'Hours', config: definition, isShared: true } },
    { what: 'a saved report edit', dto: UpdateSavedReportDto, sends: { description: 'x' } },
    {
      what: 'a schedule',
      dto: CreateReportScheduleDto,
      sends: {
        reportDefinitionId: 'r1',
        cadence: 'weekly',
        hour: 7,
        dayOfWeek: 1,
        dayOfMonth: null,
        recipients: ['a@b.c'],
      },
    },
    { what: 'a schedule edit', dto: UpdateReportScheduleDto, sends: { isActive: false } },
    { what: 'an update notice (real run)', dto: AppUpdateNotifyDto, sends: { dryRun: false } },
    { what: 'operator add-ons', dto: AdminOrgAddOnsDto, sends: { organizationId: 'o1', addOns: ['invoicing'] } },
    { what: 'a task type offered', dto: AttachSpaceWorkflowDto, sends: { makeDefault: true } },
    { what: 'a signing link opened', dto: LinkOpenDto, sends: { token: 't' } },
    { what: 'one document opened', dto: LinkFileDto, sends: { token: 't', signerId: 's' } },
    {
      what: 'a signature',
      dto: LinkSubmitDto,
      sends: {
        token: 't',
        signerIds: ['s'],
        signatureImage: 'data:image/png;base64,AA',
        name: 'Ann',
        role: null,
        idempotencyKey: 'k',
      },
    },
    { what: 'a fresh link', dto: LinkResendDto, sends: { email: 'a@b.c' } },
    { what: 'my own export', dto: ExportDocumentsDto, sends: {} },
    { what: 'verify with an expiry (inbox)', dto: VerifyDocumentDto, sends: { expiresOn: '2027-03-31' } },
    {
      what: 'an invoice',
      dto: CreateInvoiceDto,
      sends: {
        spaceId: 's1',
        clientName: 'BILLA',
        currency: 'EUR',
        exchangeRate: null,
        taxRate: 20,
        discount: 0,
        issueDate: '2026-10-17',
        servicePeriodFrom: '2026-10-01',
        servicePeriodTo: '2026-10-31',
        showLineTags: true,
        items: [{ ...line, amount: 360 }],
      },
    },
    {
      what: 'a draft edit (typed rate)',
      dto: UpdateInvoiceDto,
      sends: { exchangeRate: '1,08', exchangeRateSource: 'MANUAL', notes: 'n' },
    },
    { what: 'a status change', dto: InvoiceStatusDto, sends: { status: 'ISSUED' } },
    { what: 'a line', dto: InvoiceItemDto, sends: line },
    {
      what: 'a share',
      dto: CreateShareDto,
      sends: {
        guestOrgCode: 'ABC123',
        level: 'TASKS',
        showWorkers: true,
        showAttendance: false,
        showTracking: false,
        showReports: false,
        allowRequests: true,
      },
    },
    { what: 'a share edit', dto: UpdateShareDto, sends: { level: 'FULL' } },
    { what: 'a guest request approved (inbox)', dto: ResolveShareRequestDto, sends: { approve: true } },
    { what: 'a share accepted', dto: RespondToShareDto, sends: { accept: true } },
    { what: 'a guest request', dto: CreateShareRequestDto, sends: { type: 'TASK', title: 'More hands', note: '' } },
    {
      what: 'a device enrolled',
      dto: BiometricEnrollDto,
      sends: { deviceId: 'd', publicKey: 'k', label: 'iPhone', platform: 'ios' },
    },
    { what: 'a challenge', dto: BiometricChallengeDto, sends: { deviceId: 'd' } },
    { what: 'a signature sign-in', dto: BiometricVerifyDto, sends: { deviceId: 'd', signature: 'sig' } },
    {
      what: 'a blog post',
      dto: CreateBlogPostDto,
      sends: { title: 'T', content: '# x', tags: ['ops'], status: 'DRAFT' },
    },
    { what: 'a blog image', dto: BlogImageDto, sends: { dataBase64: 'AA', mime: 'image/png', fileName: 'a.png' } },
    { what: 'a staff sign-in with 2FA', dto: StaffLoginDto, sends: { email: 'ops@x', password: 'p', code: '123456' } },
    { what: '2FA setup without a code', dto: StaffCodeDto, sends: {} },
    {
      what: 'a staff member',
      dto: StaffCreateDto,
      sends: { email: 'e', firstName: 'f', lastName: 'l', role: 'AGENT', password: 'p' },
    },
    { what: 'a staff edit', dto: StaffPatchDto, sends: { role: 'OWNER', isActive: true } },
    { what: 'an agreed price', dto: AgreedPriceDto, sends: { monthlyCents: 12000, until: null, note: null } },
    { what: 'invoice billing', dto: BillingModeDto, sends: { mode: 'invoice', invoiceDueDays: 14 } },
    { what: 'an agent reply', dto: SupportReplyDto, sends: { body: 'Hi', isInternalNote: false } },
    { what: 'a ticket to a team', dto: SupportAssignDto, sends: { teamId: null } },
    { what: 'a team edit', dto: SupportTeamUpdateDto, sends: { name: 'EU', isActive: false } },
    { what: 'a team member', dto: SupportTeamMemberDto, sends: { platformUserId: 'p', teamRole: 'AGENT' } },
    {
      what: 'a rule toggled',
      dto: SupportRuleDto,
      sends: { id: 'r', name: 'AT', order: 1, isActive: false, conditions: { country: ['AT'] } },
    },
    { what: 'an org pinned', dto: PinOrgDto, sends: { organizationId: 'o', teamId: 't' } },
    {
      what: 'a library template',
      dto: LibraryTemplateDto,
      sends: {
        slug: 's',
        name: 'n',
        description: null,
        industry: 'cleaning',
        icon: null,
        position: 1,
        isPublished: false,
        statuses: [{ key: 'NEW' }],
      },
    },
    { what: 'an import', dto: LibraryImportDto, sends: { slug: 's', industry: 'x' } },
  ],
  [
    { what: 'a cadence of "hourly"', dto: CreateReportScheduleDto, sends: { cadence: 'hourly', recipients: [] } },
    { what: 'dryRun as the string "false"', dto: AppUpdateNotifyDto, sends: { dryRun: 'false' } },
    { what: 'a line kind that does not exist', dto: InvoiceItemDto, sends: { description: 'x', lineKind: 'WEEKS' } },
    {
      what: 'a signature with an unknown key',
      dto: LinkSubmitDto,
      sends: { token: 't', signerIds: [], signatureImage: '', name: '', idempotencyKey: 'k', admin: true },
    },
    {
      what: 'a team role that does not exist',
      dto: SupportTeamMemberDto,
      sends: { platformUserId: 'p', teamRole: 'OWNER' },
    },
  ],
);
