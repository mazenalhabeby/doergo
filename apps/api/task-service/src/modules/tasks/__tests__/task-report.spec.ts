import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  CLIENT_COPY_HIDDEN,
  CLIENT_SAFE_EVENT_TYPES,
  Role,
  TASK_REPORT_SECTIONS,
  clientSafeEvent,
  parseReportCopy,
  presentSections,
  safeSignatureDataUrl,
  toClientCopy,
  toReportRoute,
  type TaskReport,
} from '@hbcfield/shared';
import { TaskReportService } from '../task-report.service';
import { TaskQueryService } from '../task-query.service';
import { TaskAccessService } from '../../../common/task-access/task-access.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';

/**
 * The full report for one job (shared tasks/task-report.ts + TaskReportService).
 *
 * What it pins:
 *   • the client copy is cut by the SHARED rule, from what it keeps — per-person
 *     time, part prices, the route, comments, handover notes and every internal
 *     event or reason are simply not in it;
 *   • the report opens to the normal task gate only, answered 404 — never to a
 *     holder of the open role who has not taken the job, never to a cross-org
 *     guest of a shared workspace, whatever facts the caller forwards;
 *   • a module switched off in the workspace removes its section;
 *   • a step answer naming another job's file loses it; a stored signature that
 *     is not a PNG/JPEG data URL is dropped;
 *   • no labour cost or rate anywhere in the output.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ───────────────────────────── the shared rule ─────────────────────────────

const person = (id: string) => ({ id, firstName: id, lastName: 'X' });

function officeReport(): TaskReport {
  const r: TaskReport = {
    meta: { copy: 'office', generatedAt: '2026-10-09T10:00:00.000Z', sections: [], historyTruncated: false },
    header: { taskId: 't-1', title: 'Fix', reference: '#ASK-1' } as any,
    request: { description: 'Leak', origin: { kind: 'INTERNAL', portalReference: null, recurringTemplate: null, parent: null } },
    work: { summary: 'Done', workPerformed: 'Replaced valve', customerName: 'Mrs Client', completedAt: '2026-10-09T09:00:00.000Z', completedBy: person('mike') },
    time: {
      asOf: '2026-10-09T10:00:00.000Z',
      total: { travel: 10, working: 60, blocked: 5 },
      byPerson: [{ person: person('mike'), travel: 10, working: 60, blocked: 5 }],
      ownStops: [{ person: person('mike'), at: '2026-10-09T08:00:00.000Z', reason: 'Back pain', resumedAt: null }],
    },
    photos: [],
    checklist: [],
    stepAnswers: [],
    parts: [{ id: 'p1', name: 'Valve', partNumber: 'V-1', quantity: 2, notes: null, unitPrice: 12.5, lineTotal: 25 }],
    route: { distanceMeters: 1000, startedAt: null, endedAt: null, durationSeconds: 60, pointCount: 0, points: [], matchedPath: null, arrivalDistanceMeters: null },
    history: [
      { id: 'e1', type: 'CREATED', at: 'a', actor: person('anna'), refs: {}, data: { source: 'recurring_template', templateTitle: 'Monthly', templateId: 'tpl' } },
      { id: 'e2', type: 'STATUS_CHANGED', at: 'b', actor: person('mike'), refs: { forUserId: person('mike') }, data: { oldStatus: 'IN_PROGRESS', newStatus: 'BLOCKED', reason: 'Customer shouted', officeReason: 'x', byOffice: true } },
      { id: 'e3', type: 'COMMENT_ADDED', at: 'c', actor: person('mike'), refs: {}, data: { content: 'internal' } },
      { id: 'e4', type: 'SELF_BLOCKED', at: 'd', actor: person('mike'), refs: {}, data: { reason: 'Back pain' } },
      { id: 'e5', type: 'CREW_LEFT', at: 'e', actor: person('mike'), refs: {}, data: { why: 'CLOCK_OUT' } },
      { id: 'e6', type: 'OFFERED', at: 'f', actor: person('anna'), refs: {}, data: { wave: 1 } },
      { id: 'e7', type: 'UPDATED', at: 'g', actor: person('anna'), refs: {}, data: { changes: { title: 'x' } } },
      { id: 'e8', type: 'ASSIGNED', at: 'h', actor: person('anna'), refs: { workerId: person('mike') }, data: { workerId: 'mike', workerName: 'Mike X' } },
      { id: 'e9', type: 'PAUSED', at: 'i', actor: person('mike'), refs: {}, data: { reason: 'CLOCK_OUT' } },
      { id: 'e10', type: 'LEAD_CHANGED', at: 'j', actor: person('anna'), refs: {}, data: { reason: 'sick' } },
      { id: 'e11', type: 'HANDOVER_ADDED', at: 'k', actor: person('mike'), refs: {}, data: { content: 'note' } },
    ],
    comments: [{ id: 'c1', content: 'internal chat', createdAt: 'x', author: person('anna') }],
    handovers: [{ id: 'h1', note: 'left the key under the mat', createdAt: 'x', author: person('mike'), workedMinutes: 30 }],
    documents: [],
    details: [],
    signatures: [],
  };
  r.meta.sections = presentSections(r);
  return r;
}

describe('task report — the shared rule', () => {
  it('parses the copy: absent = office, unknown = refused', () => {
    expect(parseReportCopy(undefined)).toBe('office');
    expect(parseReportCopy('client')).toBe('client');
    expect(parseReportCopy('CLIENT')).toBeNull();
    expect(parseReportCopy(['client'])).toBeNull();
  });

  it('the office copy lists every section it carries, in print order', () => {
    expect(officeReport().meta.sections).toEqual(TASK_REPORT_SECTIONS.filter((s) => s !== undefined));
  });

  it('the client copy drops exactly the listed sections and fields', () => {
    const client = toClientCopy(officeReport());
    for (const s of CLIENT_COPY_HIDDEN.sections) expect(client).not.toHaveProperty(s);
    for (const k of CLIENT_COPY_HIDDEN.time) expect(client.time).not.toHaveProperty(k);
    for (const k of CLIENT_COPY_HIDDEN.parts) expect(client.parts![0]).not.toHaveProperty(k);
    expect(client.time!.total).toEqual({ travel: 10, working: 60, blocked: 5 });
    expect(client.parts![0]).toEqual({ id: 'p1', name: 'Valve', partNumber: 'V-1', quantity: 2, notes: null });
    expect(client.meta.copy).toBe('client');
    expect(client.meta.sections).not.toEqual(expect.arrayContaining(['route']));
    expect(client.meta.sections).toEqual(presentSections(client));
    // What stays.
    expect(client.work?.summary).toBe('Done');
    expect(client).toHaveProperty('signatures');
    expect(client).toHaveProperty('stepAnswers');
  });

  it('keeps only the client-safe events, and of them only the safe facts', () => {
    const client = toClientCopy(officeReport());
    expect(client.history.map((e) => e.type)).toEqual(['CREATED', 'STATUS_CHANGED', 'CREW_LEFT', 'ASSIGNED']);
    for (const e of client.history) expect(CLIENT_SAFE_EVENT_TYPES).toContain(e.type);
    const json = JSON.stringify(client);
    for (const leak of ['Customer shouted', 'Back pain', 'CLOCK_OUT', 'internal', 'left the key', 'officeReason', 'byOffice', 'sick']) {
      expect(json).not.toContain(leak);
    }
    const move = client.history.find((e) => e.type === 'STATUS_CHANGED')!;
    expect(move.data).toEqual({ oldStatus: 'IN_PROGRESS', newStatus: 'BLOCKED' });
    expect(move.refs).toEqual({});
    expect(client.history.find((e) => e.type === 'ASSIGNED')!.refs.workerId?.id).toBe('mike');
  });

  it('an event type nobody decided on is internal by default', () => {
    expect(clientSafeEvent({ id: 'x', type: 'SOMETHING_NEW', at: 'a', actor: null, refs: {}, data: {} })).toBeNull();
  });

  it('a new office field does not reach the client copy by default', () => {
    const r = officeReport() as any;
    r.secretNewSection = ['x'];
    r.time.newInternalFigure = 42;
    const client = toClientCopy(r) as any;
    expect(client.secretNewSection).toBeUndefined();
    expect(client.time.newInternalFigure).toBeUndefined();
  });

  it('passes a PNG/JPEG data URL signature and nothing else', () => {
    expect(safeSignatureDataUrl(PNG)).toBe(PNG);
    expect(safeSignatureDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ');
    for (const bad of [
      'https://evil.example/sig.png',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:image/png;base64,abc"><script>',
      'data:text/html;base64,PGgxPg==',
      '',
      null,
      42,
    ]) expect(safeSignatureDataUrl(bad)).toBeNull();
  });

  it('maps a tracked route and measures the last point against the pin', () => {
    const route = toReportRoute(
      { distance: 1200, duration: 600, startTime: '2026-10-09T08:00:00Z', endTime: '2026-10-09T08:10:00Z', points: [{ lat: 48, lng: 14, timestamp: '2026-10-09T08:00:00Z' }, { lat: 48.001, lng: 14, timestamp: '2026-10-09T08:10:00Z' }] },
      { lat: 48, lng: 14 },
    );
    expect(route.pointCount).toBe(2);
    expect(route.arrivalDistanceMeters).toBe(111);
    expect(toReportRoute({ points: [] }, { lat: null, lng: null }).arrivalDistanceMeters).toBeNull();
  });
});

// ───────────────────────────── the service ─────────────────────────────

describe('TaskReportService', () => {
  const ORG = 'org-1';
  const admin = { userId: 'boss', userRole: Role.ADMIN, organizationId: ORG };

  let prisma: any;
  let svc: TaskReportService;
  let deps: Record<string, any>;

  const task = (over: Record<string, unknown> = {}) => ({
    id: 't-1',
    title: 'Boiler service',
    description: 'No hot water',
    status: 'COMPLETED',
    priority: 'HIGH',
    dueDate: new Date('2026-10-09T13:00:00Z'),
    createdAt: new Date('2026-10-01T08:00:00Z'),
    source: 'INTERNAL',
    organizationId: ORG,
    spaceId: 'space-1',
    workflowId: null,
    assignedToId: 'mike',
    openRoleId: null,
    locationAddress: 'Hauptstraße 1',
    locationLat: 48,
    locationLng: 14,
    createdBy: { id: 'boss', firstName: 'John', lastName: 'Owner' },
    parent: null,
    assignees: [{ userId: 'mike', role: 'LEAD', user: { id: 'mike', firstName: 'Mike', lastName: 'Weber', costRateCents: 4000 } }],
    customer: null,
    unit: null,
    asset: null,
    // Rates a careless spread would carry out — the report must not.
    space: { id: 'space-1', name: 'North', address: 'Depot', timezone: 'Europe/Vienna', enabledModules: ['checklists', 'attachments', 'service_reports', 'custom_fields', 'tracking'], workflowId: null, currency: null, legalEntityId: null, costRateCents: 3000, billableRateCents: 9000 },
    organization: { name: 'HBC', enabledModules: [], currency: 'EUR', addressLine1: 'Street 1', city: 'Linz', postalCode: '4020', country: 'AT', vatId: 'ATU1', costRateCents: 2500, billableRateCents: 8000 },
    ...over,
  });

  beforeEach(() => {
    prisma = {
      task: { findUnique: jest.fn().mockResolvedValue(task()) },
      taskAssignee: { findFirst: jest.fn().mockResolvedValue(null) },
      taskEvent: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      taskHandover: { findMany: jest.fn().mockResolvedValue([]) },
      legalEntity: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      customerContact: { findFirst: jest.fn().mockResolvedValue(null) },
      taskStepSubmission: { findMany: jest.fn().mockResolvedValue([]) },
      // Honours the task scope, as Postgres would.
      attachment: { findMany: jest.fn() },
      spaceAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const access = new TaskAccessService(prisma);
    const support: any = { taskAccess: access };
    const jobTime: any = {
      forTask: jest.fn().mockResolvedValue({
        asOf: '2026-10-09T10:00:00.000Z',
        total: { travel: 10, working: 60, blocked: 0 },
        byWorker: [{ user: { id: 'mike', firstName: 'Mike', lastName: 'Weber' }, travel: 10, working: 60, blocked: 0, live: null }],
        live: null,
        startedBy: { user: null, forUser: null, office: false, reason: null, at: '2026-10-09T08:00:00.000Z' },
      }),
    };
    const query = new TaskQueryService(prisma, { getWorkflow: jest.fn() } as any, new MediaSigner(null), jobTime, {} as any, support);
    deps = {
      workflows: { getWorkflow: jest.fn().mockResolvedValue({ statuses: [{ key: 'COMPLETED', name: 'Done', color: '#0a0', isFinal: true, isCanceled: false }] }) },
      jobTime,
      query,
      activity: { getComments: jest.fn().mockResolvedValue({ data: [{ id: 'c1', content: 'Hi', createdAt: new Date(), user: { id: 'boss', firstName: 'John', lastName: 'Owner' } }] }) },
      checklist: { getChecklist: jest.fn().mockResolvedValue({ data: [{ id: 'i1', text: 'Check pressure', isCompleted: true, assignee: null, completedBy: { id: 'mike', firstName: 'Mike', lastName: 'Weber' }, completedAt: new Date() }] }) },
      attachments: { findByTask: jest.fn().mockResolvedValue({ data: [] }) },
      reports: {
        findByTaskId: jest.fn().mockResolvedValue({
          data: {
            summary: 'Serviced',
            workPerformed: 'Cleaned burner',
            customerName: 'Mrs Client',
            completedAt: new Date('2026-10-09T09:00:00Z'),
            completedBy: { id: 'mike', firstName: 'Mike', lastName: 'Weber', email: 'mike@example.com' },
            technicianSignature: PNG,
            // Not a signature: a URL the PDF would fetch from.
            customerSignature: 'https://evil.example/x.png',
            partsUsed: [{ id: 'p1', name: 'Seal', partNumber: 'S-1', quantity: 3, unitCost: 2.5, notes: null }],
            attachments: [],
          },
        }),
      },
      customFields: { getTaskValues: jest.fn().mockResolvedValue({ data: [{ definitionId: 'd1', value: 'PO-77', definition: { name: 'PO', key: 'po', type: 'TEXT' } }, { definitionId: 'd2', value: '', definition: { name: 'Empty', key: 'e', type: 'TEXT' } }] }) },
    };
    prisma.attachment.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        [
          { id: 'own-photo', taskId: 't-1', fileName: 'a.jpg', mimeType: 'image/jpeg', fileType: 'IMAGE', fileSize: 10, createdAt: new Date() },
          { id: 'own-sig', taskId: 't-1', fileName: 's.png', mimeType: 'image/png', fileType: 'IMAGE', fileSize: 10, createdAt: new Date() },
          { id: 'foreign-photo', taskId: 'OTHER', fileName: 'b.jpg', mimeType: 'image/jpeg', fileType: 'IMAGE', fileSize: 10, createdAt: new Date() },
        ].filter((a) => a.taskId === where.taskId && (!where.id || where.id.in.includes(a.id))),
      ),
    );
    svc = new TaskReportService(
      prisma,
      deps.workflows,
      jobTime,
      support,
      query,
      deps.activity,
      deps.checklist,
      deps.attachments,
      deps.reports,
      deps.customFields,
    );
  });

  const build = (facts: Record<string, unknown> = admin, copy?: string) =>
    svc.build({ id: 't-1', ...(facts as any), ...(copy ? { copy } : {}) }).then((r) => r.data as TaskReport);

  it('refuses an unknown copy with 400', async () => {
    await expect(svc.build({ id: 't-1', ...admin, copy: 'everything' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('an unfinished job has no report yet (409, coded) — and nothing else is read', async () => {
    prisma.task.findUnique.mockResolvedValue(task({ status: 'IN_PROGRESS' }));
    await expect(build()).rejects.toMatchObject({ response: { code: 'REPORT_NOT_FINISHED' } });
    expect(deps.reports.findByTaskId).not.toHaveBeenCalled();
  });

  it('"finished" is the final step of the job’s flow, whatever it is called — a cancel is not', async () => {
    deps.workflows.getWorkflow.mockResolvedValue({
      statuses: [
        { key: 'delivered', name: 'Delivered', isFinal: true, isCanceled: false },
        { key: 'dropped', name: 'Dropped', isFinal: true, isCanceled: true },
      ],
    });
    prisma.task.findUnique.mockResolvedValue(task({ status: 'delivered' }));
    await expect(build()).resolves.toBeDefined();
    prisma.task.findUnique.mockResolvedValue(task({ status: 'dropped' }));
    await expect(build()).rejects.toBeInstanceOf(ConflictException);
  });

  it('a member not on the job gets 404, not 403', async () => {
    await expect(build({ userId: 'nobody', userRole: Role.EMPLOYEE, organizationId: ORG })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a missing job is the same 404', async () => {
    prisma.task.findUnique.mockResolvedValue(null);
    await expect(build()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a holder of the open role who has not taken the job gets 404', async () => {
    prisma.task.findUnique.mockResolvedValue(task({ openRoleId: 'role-mechanic', assignees: [], assignedToId: null }));
    // Even if they hold the role in the workspace — the report never asks.
    prisma.spaceAssignment.findFirst.mockResolvedValue({ id: 'holds-it' });
    await expect(build({ userId: 'karim', userRole: Role.EMPLOYEE, organizationId: ORG })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a cross-org guest of a shared workspace gets 404, even forwarding the share', async () => {
    const guest = { userId: 'guest', userRole: Role.ADMIN, organizationId: 'org-GUEST', canViewAllTasks: true, sharedSpaceIds: ['space-1'] };
    await expect(build(guest)).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.reports.findByTaskId).not.toHaveBeenCalled();
  });

  it('builds the office copy with every section the workspace runs', async () => {
    const r = await build();
    expect(r.meta.copy).toBe('office');
    expect(r.meta.sections).toEqual([
      'header', 'request', 'work', 'time', 'photos', 'checklist', 'stepAnswers', 'parts', 'route',
      'history', 'comments', 'handovers', 'documents', 'details', 'signatures',
    ]);
    expect(r.route).toBeNull(); // the gateway's to fill
    expect(r.header.finishedAt).toBe('2026-10-09T09:00:00.000Z');
    expect(r.header.totalMinutes).toBe(70);
    expect(r.header.issuer.name).toBe('HBC');
    expect(r.parts![0]).toMatchObject({ unitPrice: 2.5, lineTotal: 7.5 });
    expect(r.details).toEqual([{ id: 'd1', name: 'PO', key: 'po', type: 'TEXT', value: 'PO-77' }]);
    expect(r.time!.byPerson![0]!.person.id).toBe('mike');
  });

  it('drops a stored signature that is not a PNG/JPEG data URL', async () => {
    const r = await build();
    expect(r.signatures!.map((s) => s.kind)).toEqual(['TECHNICIAN']);
    expect(JSON.stringify(r)).not.toContain('evil.example');
  });

  it('a module switched off removes its section, and its read is never made', async () => {
    prisma.task.findUnique.mockResolvedValue(task({ space: { ...task().space, enabledModules: [] } }));
    const r = await build();
    for (const s of ['checklist', 'documents', 'work', 'parts', 'details', 'route'] as const) {
      expect(r).not.toHaveProperty(s);
      expect(r.meta.sections).not.toContain(s);
    }
    expect(deps.checklist.getChecklist).not.toHaveBeenCalled();
    expect(deps.reports.findByTaskId).not.toHaveBeenCalled();
    expect(deps.customFields.getTaskValues).not.toHaveBeenCalled();
    expect(deps.attachments.findByTask).not.toHaveBeenCalled();
  });

  it("a step answer keeps only THIS job's files", async () => {
    prisma.taskStepSubmission.findMany.mockResolvedValue([
      {
        id: 's1',
        statusKey: 'COMPLETED',
        formVersion: 1,
        form: { version: 1, fields: [
          { id: 'f1', type: 'photos', label: 'Photos of the boiler', required: false },
          { id: 'f2', type: 'signature', label: 'Customer signs', required: false },
          { id: 'f3', type: 'note', label: 'Note', required: false },
        ] },
        answers: { f1: ['own-photo', 'foreign-photo'], f2: 'own-sig', f3: 'All good' },
        submittedById: 'mike',
        submittedAt: new Date('2026-10-09T09:00:00Z'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'mike', firstName: 'Mike', lastName: 'Weber' }]);
    const r = await build();
    const fields = r.stepAnswers![0]!.fields;
    expect(fields[0]).toMatchObject({ label: 'Photos of the boiler', value: ['own-photo'] });
    expect(fields[0]!.files.map((f) => f.id)).toEqual(['own-photo']);
    expect(fields[2]).toMatchObject({ label: 'Note', value: 'All good' });
    expect(r.photos!.filter((p) => p.source === 'STEP').map((p) => p.id)).toEqual(['own-photo']);
    expect(r.signatures!.find((s) => s.kind === 'STEP')).toMatchObject({ fieldLabel: 'Customer signs' });
    expect(JSON.stringify(r)).not.toContain('foreign-photo');
  });

  it('reads the WHOLE history in pages, chronological, with a ceiling', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: `e${String(i).padStart(5, '0')}`, eventType: 'UPDATED', metadata: {}, createdAt: new Date(1_700_000_000_000 + i * 1000), userId: 'boss' }));
    const desc = [...all].reverse();
    prisma.taskEvent.findMany.mockImplementation(({ take, cursor }: any) => {
      const from = cursor ? desc.findIndex((e) => e.id === cursor.id) + 1 : 0;
      return Promise.resolve(desc.slice(from, from + take));
    });
    const r = await build();
    expect(r.history).toHaveLength(2500);
    expect(r.history[0]!.id).toBe('e00000');
    expect(r.meta.historyTruncated).toBe(false);
    expect(prisma.taskEvent.findMany).toHaveBeenCalledTimes(3);
    // People resolved once for the whole history, never per event.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('says so when the history passes the ceiling, keeping the end of the job', async () => {
    const desc = Array.from({ length: 6000 }, (_, i) => ({ id: `e${i}`, eventType: 'UPDATED', metadata: {}, createdAt: new Date(2_000_000_000_000 - i * 1000), userId: 'boss' }));
    prisma.taskEvent.findMany.mockImplementation(({ take, cursor }: any) => {
      const from = cursor ? desc.findIndex((e) => e.id === cursor.id) + 1 : 0;
      return Promise.resolve(desc.slice(from, from + take));
    });
    const r = await build();
    expect(r.history).toHaveLength(5000);
    expect(r.meta.historyTruncated).toBe(true);
    expect(r.history[r.history.length - 1]!.id).toBe('e0');
  });

  it('the client copy is cut in the service', async () => {
    const r = await build(admin, 'client');
    expect(r.meta.copy).toBe('client');
    for (const s of ['route', 'comments', 'handovers']) expect(r).not.toHaveProperty(s);
    expect(r.time).not.toHaveProperty('byPerson');
    expect(r.parts![0]).not.toHaveProperty('unitPrice');
  });

  it('carries no labour cost or rate, in either copy', async () => {
    for (const copy of ['office', 'client']) {
      const json = JSON.stringify(await build(admin, copy));
      expect(json).not.toMatch(/costRate|billableRate|RateCents/);
    }
    const select = JSON.stringify(prisma.task.findUnique.mock.calls[0][0].select);
    expect(select).not.toMatch(/costRate|billableRate/);
  });

  describe('"Issued by" — chosen per report, like an invoice', () => {
    // Rows as Prisma would return them for ISSUER_SELECT — tax data included, bank never selected.
    const company = (id: string, over: Record<string, unknown> = {}) => ({
      id, isMain: false, legalName: `${id} GmbH`, label: null, addressLine1: 'Street', addressLine2: null, postalCode: '1010', city: 'Wien',
      state: null, country: 'AT', vatId: `VAT-${id}`, taxId: `TAX-${id}`, registerNumber: `FN-${id}`, email: null, phone: null,
      website: null, logoUrl: null, currency: 'EUR', ...over,
    });
    const active = [company('main', { isMain: true }), company('usa', { label: 'HBC USA', currency: 'USD' })];

    beforeEach(() => {
      prisma.legalEntity.findMany.mockResolvedValue(active);
      // Honours the where clause, as Postgres would: this organization's ACTIVE companies only.
      prisma.legalEntity.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          [...active.map((c) => ({ ...c, organizationId: ORG, isActive: true })), { ...company('off'), organizationId: ORG, isActive: false }, { ...company('foreign'), organizationId: 'org-OTHER', isActive: true }]
            .find((c) => c.id === where.id && c.organizationId === where.organizationId && c.isActive === where.isActive) ?? null,
        ),
      );
    });

    it('absent = the automatic rule (workspace → client → main), and says which it picked', async () => {
      const r = await build();
      expect(r.meta.issuerId).toBe('main');
      expect(r.meta.issuerDefaultId).toBe('main');
      expect(r.header.issuer.name).toBe('main GmbH');
    });

    it('a valid choice is the letterhead — and the currency follows the company', async () => {
      const r = await svc.build({ id: 't-1', ...admin, issuer: 'usa' }).then((x) => x.data as TaskReport);
      expect(r.meta.issuerId).toBe('usa');
      expect(r.meta.issuerDefaultId).toBe('main');
      expect(r.header.issuer).toMatchObject({ name: 'usa GmbH', vatId: 'VAT-usa' });
      expect(r.header.currency).toBe('USD');
    });

    it.each(['foreign', 'off', 'nope', 42])('refuses %p with a coded 400 — never a silent fall-back', async (issuer) => {
      await expect(svc.build({ id: 't-1', ...admin, issuer })).rejects.toMatchObject({ response: { code: 'REPORT_ISSUER_INVALID' } });
      await expect(svc.build({ id: 't-1', ...admin, issuer })).rejects.toBeInstanceOf(BadRequestException);
      expect(deps.reports.findByTaskId).not.toHaveBeenCalled();
    });

    it("a refusal is asked of the CALLER's organization", async () => {
      await svc.build({ id: 't-1', ...admin, issuer: 'usa' });
      expect(prisma.legalEntity.findFirst.mock.calls[0][0].where).toEqual({ id: 'usa', organizationId: ORG, isActive: true });
    });

    it('the choice list is id, name and main only — no bank, tax or address', async () => {
      const r = await build();
      expect(r.meta.issuers).toEqual([
        { id: 'main', name: 'main GmbH', isMain: true },
        { id: 'usa', name: 'HBC USA', isMain: false },
      ]);
      const list = JSON.stringify(r.meta.issuers);
      expect(list).not.toMatch(/VAT-|TAX-|FN-|Street|iban|bank/i);
      // And the client copy keeps the same list (the office chose who it is from).
      const c = await build(admin, 'client');
      expect(c.meta.issuers).toEqual(r.meta.issuers);
    });

    it('an empty issuer is the automatic rule', async () => {
      const r = await svc.build({ id: 't-1', ...admin, issuer: '' }).then((x) => x.data as TaskReport);
      expect(r.meta.issuerId).toBe('main');
    });
  });

  it("a client's details only to a reader the CRM lets in; the name always", async () => {
    prisma.task.findUnique.mockResolvedValue(
      task({ customer: { id: 'c-1', name: 'BILLA AG', type: 'COMPANY', legalName: 'BILLA AG', vatId: 'ATU9', address: 'Wien', email: 'office@billa.at', phone: '+43', contactName: 'Eva', ownerId: 'rep', managerIds: [], currency: null, legalEntityId: null } }),
    );
    // Mike is on the job, and holds no CRM permission.
    prisma.user.findFirst.mockResolvedValue({ role: Role.EMPLOYEE, memberRole: { permissions: {} } });
    const r = await build({ userId: 'mike', userRole: Role.EMPLOYEE, organizationId: ORG });
    expect(r.header.client).toMatchObject({ name: 'BILLA AG', restricted: true, email: null, phone: null, vatId: null });
    expect(JSON.stringify(r.header)).not.toContain('office@billa.at');

    const forAdmin = await build();
    expect(forAdmin.header.client).toMatchObject({ restricted: false, email: 'office@billa.at' });
  });
});

describe('client copy — what the office adds back', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toClientCopy, parseClientCopyInclude, CLIENT_COPY_OPTIONS } = require('@hbcfield/shared');
  const person = { id: 'u1', firstName: 'Mike', lastName: 'Weber' };
  const office: any = {
    meta: { copy: 'office', generatedAt: '2026-10-08T00:00:00.000Z', sections: [], historyTruncated: false },
    header: { site: { lat: null, lng: null } },
    request: { description: null },
    time: { asOf: 'x', total: { travel: 1, working: 2, blocked: 3 }, byPerson: [{ person, travel: 1, working: 2, blocked: 3 }], ownStops: [{ person, at: 'x', reason: 'key', resumedAt: null }] },
    parts: [{ id: 'p', name: 'Box', partNumber: 'JB', quantity: 1, notes: null, unitPrice: 3490, lineTotal: 3490 }],
    route: null,
    comments: [{ id: 'c', content: 'internal', createdAt: 'x', author: person }],
    handovers: [{ id: 'h', note: 'note', createdAt: 'x', author: person, workedMinutes: 5 }],
    history: [{ id: 'e', type: 'OFFERED', at: 'x', actor: null, refs: {}, data: { wave: 1 } }],
  };

  it('adds nothing by default', () => {
    const c = toClientCopy(office);
    expect(c.time.byPerson).toBeUndefined();
    expect(c.time.ownStops).toBeUndefined();
    expect(c.parts[0].unitPrice).toBeUndefined();
    expect('route' in c || 'comments' in c || 'handovers' in c).toBe(false);
    expect(c.history).toEqual([]);
  });

  it('adds back exactly what was chosen, and nothing else', () => {
    const c = toClientCopy(office, ['partPrices', 'comments']);
    expect(c.parts[0].unitPrice).toBe(3490);
    expect(c.comments).toHaveLength(1);
    expect(c.handovers).toBeUndefined();
    expect(c.time.byPerson).toBeUndefined();
    expect(c.meta.include).toEqual(['partPrices', 'comments']);
  });

  it('every option can be added back', () => {
    const c = toClientCopy(office, [...CLIENT_COPY_OPTIONS]);
    expect(c.time.byPerson).toHaveLength(1);
    expect(c.time.ownStops).toHaveLength(1);
    expect('route' in c).toBe(true);
    expect(c.handovers).toHaveLength(1);
    expect(c.history).toHaveLength(1);
  });

  it('parses the query, and refuses an unknown key rather than guessing', () => {
    expect(parseClientCopyInclude(undefined)).toEqual([]);
    expect(parseClientCopyInclude('route, partPrices,route')).toEqual(['route', 'partPrices']);
    expect(parseClientCopyInclude(['comments', 'handovers'])).toEqual(['comments', 'handovers']);
    expect(parseClientCopyInclude('route,costRates')).toBeNull();
  });
});
