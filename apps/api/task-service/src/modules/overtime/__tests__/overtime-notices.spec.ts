import { readFileSync } from 'fs';
import { join } from 'path';
import { OVERTIME_NOTICE_EVENT, OVERTIME_NOTICE_KINDS, overtimeNoticeKeys } from '@hbcfield/shared';
import { OvertimeService } from '../overtime.service';

/**
 * Who hears about an overtime request, and in which language.
 *
 * The request push went to every ADMIN and everyone with the flat
 * `canViewAllTasks` column — the wrong permission, read org-wide — and every
 * push in this flow was an English sentence emitted as `push_notification`,
 * an event no service listens to. It now asks the attendance routing and sends
 * catalogue references.
 */
describe('overtime pushes', () => {
  const pending = {
    id: 'ot1',
    technicianId: 'tech',
    timeEntryId: 'te1',
    locationId: 'site-a',
    organizationId: 'org1',
    location: { name: 'Main Office' },
    technician: { firstName: 'Mike', lastName: null },
    timeEntry: {},
  };

  const build = (targets: string[]) => {
    const prisma: any = {
      overtimeRequest: {
        findFirst: jest.fn().mockResolvedValue(pending),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn() },
    };
    const emit = jest.fn();
    const attendance: any = { notifyTargetsFor: jest.fn().mockResolvedValue(targets) };
    const svc = new OvertimeService(prisma, { emit } as any, {} as any, attendance);
    return { svc, prisma, emit, attendance };
  };

  it('asks the workspace routing for canApproveOvertime, never the org-wide admin list', async () => {
    const { svc, prisma, emit, attendance } = build(['leader', 'tech']);
    await svc.technicianRespond({ userId: 'tech', response: 'YES', organizationId: 'org1' });

    expect(attendance.notifyTargetsFor).toHaveBeenCalledWith(
      { locationId: 'site-a', organizationId: 'org1', userId: 'tech' },
      'canApproveOvertime',
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(OVERTIME_NOTICE_EVENT, {
      recipientIds: ['leader'], // the member is never asked to approve their own
      organizationId: 'org1',
      kind: 'approvalRequest',
      params: { name: 'Mike', location: 'Main Office' }, // not "Mike null"
      data: { type: 'overtime.approval_request', overtimeRequestId: 'ot1' },
    });
  });

  it('routes to nobody when nothing is configured — no push at all', async () => {
    const { svc, emit } = build([]);
    await svc.technicianRespond({ userId: 'tech', response: 'YES', organizationId: 'org1' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('writes no sentence and uses no unheard event', () => {
    const src = readFileSync(join(__dirname, '..', 'overtime.service.ts'), 'utf8');
    expect(src).not.toMatch(/'push_notification'/);
    expect(src).not.toMatch(/\btitle:\s*['`]/);
    expect(src).not.toMatch(/\bbody:\s*['`]/);
  });

  it('every kind names a title and a body key', () => {
    for (const kind of OVERTIME_NOTICE_KINDS) {
      expect(overtimeNoticeKeys(kind)).toEqual({ title: `overtime.${kind}.title`, body: `overtime.${kind}.body` });
    }
  });
});
