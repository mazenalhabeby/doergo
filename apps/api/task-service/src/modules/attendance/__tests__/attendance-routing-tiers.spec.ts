import { AttendanceRoutingService } from '../core/attendance-routing.service';
import { alertRecipients, decidersAbout, type WorkspaceDecider } from '../../approvals/rules/workspace-deciders';

/**
 * Who is pushed about a member's clock (clock review A2–A4): the workspace's deciders and stand-ins, nobody on
 * leave, never the person, never a stand-in about the leader they cover — then watchers, then org-wide
 * deciders, then the admins, each only when the one before found nobody.
 */
const d = (id: string, via: WorkspaceDecider['via'], extra: Partial<WorkspaceDecider> = {}): WorkspaceDecider => ({
  id,
  name: id,
  avatarUrl: null,
  via,
  onLeave: false,
  covers: [],
  ...extra,
});

describe('alertRecipients — the tiers', () => {
  const all = [d('lead', 'SPACE'), d('manager', 'ORG'), d('owner', 'ADMIN')];

  it('the workspace’s own people first; nobody else is told', () => {
    expect(alertRecipients(all, ['watcher'], { subjectUserId: 'w', mayEscalate: true })).toEqual(['lead']);
  });

  it('a leader on leave is skipped; their stand-in is told instead', () => {
    const list = [d('lead', 'SPACE', { onLeave: true }), d('stand-in', 'DELEGATED', { covers: ['lead'] })];
    expect(alertRecipients(list, [], { subjectUserId: 'w', mayEscalate: true })).toEqual(['stand-in']);
  });

  it('never the person themselves, never a stand-in about the leader they cover', () => {
    const list = [d('lead', 'SPACE'), d('stand-in', 'DELEGATED', { covers: ['lead'] })];
    expect(decidersAbout(list, 'lead').map((x) => x.id)).toEqual([]);
    expect(alertRecipients(list, [], { subjectUserId: 'lead', mayEscalate: true })).toEqual([]);
  });

  it('no local decider → the watchers', () => {
    const list = [d('manager', 'ORG'), d('owner', 'ADMIN')];
    expect(alertRecipients(list, ['watcher', 'w'], { subjectUserId: 'w', mayEscalate: true })).toEqual(['watcher']);
  });

  it('nobody local, no watchers → org-wide deciders, then the admins (an alert always reaches somebody)', () => {
    expect(
      alertRecipients([d('manager', 'ORG'), d('owner', 'ADMIN')], [], { subjectUserId: 'w', mayEscalate: true }),
    ).toEqual(['manager']);
    expect(alertRecipients([d('owner', 'ADMIN')], [], { subjectUserId: 'w', mayEscalate: true })).toEqual(['owner']);
  });

  it('a member’s own request is never padded with admins', () => {
    expect(alertRecipients([d('owner', 'ADMIN')], [], { subjectUserId: 'w', mayEscalate: false })).toEqual([]);
  });
});

describe('AttendanceRoutingService', () => {
  const build = (list: WorkspaceDecider[], watchers: string[] = []) => {
    const deciders = { workspaceDeciders: jest.fn().mockResolvedValue(list) };
    const notificationRouting = { resolveWatchers: jest.fn().mockResolvedValue({ ids: watchers, emails: [] }) };
    return {
      svc: new AttendanceRoutingService(notificationRouting as never, deciders as never),
      deciders,
      notificationRouting,
    };
  };
  const entry = { locationId: 's1', organizationId: 'o1', userId: 'w' };

  it('attendance alerts ask for whoever approves hours, decides extra time or settles a no-show (a team leader too)', async () => {
    const { svc, deciders } = build([d('team-leader', 'SPACE')]);
    expect(await svc.notifyTargetsFor(entry, 'attendance')).toEqual(['team-leader']);
    expect(deciders.workspaceDeciders).toHaveBeenCalledWith('o1', 's1', ['hours', 'extraTime', 'noShow']);
  });

  it('builds the workspace half once per sweep; the watchers only when the workspace has nobody', async () => {
    const { svc, deciders, notificationRouting } = build([d('lead', 'SPACE')]);
    const cache = new Map();
    await svc.notifyTargetsFor(entry, 'attendance', cache);
    await svc.notifyTargetsFor({ ...entry, userId: 'w2' }, 'attendance', cache);
    expect(deciders.workspaceDeciders).toHaveBeenCalledTimes(1);
    expect(notificationRouting.resolveWatchers).not.toHaveBeenCalled();
  });

  it('a day to review: the watchers AND the workspace’s approvers', async () => {
    const { svc } = build([d('shift-leader', 'SPACE'), d('owner', 'ADMIN')], ['watcher']);
    expect((await svc.reviewTargetsFor(entry)).sort()).toEqual(['shift-leader', 'watcher']);
  });

  it('a day to review in an unconfigured workspace reaches an admin, not nobody', async () => {
    const { svc } = build([d('owner', 'ADMIN')]);
    expect(await svc.reviewTargetsFor(entry)).toEqual(['owner']);
  });
});
