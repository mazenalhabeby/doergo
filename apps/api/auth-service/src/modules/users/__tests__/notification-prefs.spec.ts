import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { UsersService } from '../users.service';
import { OnboardingService } from '../../onboarding/onboarding.service';

/**
 * Two sets of notification switches, stored where they are read.
 */

describe('a member’s own notification switches', () => {
  function service(existing: unknown) {
    const svc = Object.create(UsersService.prototype) as any;
    svc.prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ notificationPrefs: existing }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return svc;
  }

  it('merges known boolean keys and drops everything else', async () => {
    const svc = service({ attendance: false });
    const res = await svc.updateNotificationPrefs('u1', {
      emailTaskAssigned: false,
      emailAutoClockOut: 'false',
      isAdmin: true,
      nested: { x: 1 },
    });
    expect(res.data).toEqual({ attendance: false, emailTaskAssigned: false });
    expect(svc.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notificationPrefs: res.data } });
  });
});

describe('reading a member’s switches', () => {
  it('says which emails the organization allows, so the screen can explain a switch that is off above them', async () => {
    const svc = Object.create(UsersService.prototype) as any;
    svc.prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          notificationPrefs: { emailTaskCompleted: false },
          organization: { notificationPrefs: { emailOnAutoClockOut: false } },
        }),
      },
    };
    expect(await svc.getNotificationPrefs('u1')).toEqual({
      data: { emailTaskCompleted: false },
      organizationAllows: { taskAssigned: true, taskCompleted: true, autoClockOut: false },
    });
  });
});

describe('the organization’s notification switches', () => {
  function service(existing: unknown, found = true) {
    const svc = Object.create(OnboardingService.prototype) as any;
    svc.prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue(found ? { notificationPrefs: existing } : null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return svc;
  }

  /*
    Partial saves must not reset the rest: an email switch that is UNSET is ON,
    so replacing the JSON with only what one screen sent would silently switch
    back on an email the admin had turned off.
  */
  it('merges into what was saved, keeping switches the request did not name', async () => {
    const svc = service({ emailOnTaskAssigned: false, emailOnTaskCreate: true });
    const res = await svc.updateNotificationPrefs('org-1', { emailOnAutoClockOut: false, junk: true });
    expect(res.data.notificationPrefs).toEqual({ emailOnTaskAssigned: false, emailOnAutoClockOut: false });
  });

  it('answers 404 for an organization that does not exist', async () => {
    const res = await service(null, false).updateNotificationPrefs('nope', {});
    expect(res).toMatchObject({ success: false, statusCode: 404 });
  });
});

/*
  Nest keeps only the LAST handler registered for a message pattern, silently.
  The member's and the organization's settings both answered
  `update_notification_prefs`, so one of the two saves always reached the other
  handler. Checked across every service that listens on Redis.
*/
describe('message patterns', () => {
  const API = join(__dirname, '..', '..', '..', '..', '..');
  const SERVICES = ['auth-service', 'task-service', 'notification-service', 'tracking-service'];

  function tsFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : tsFiles(full);
      return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
    });
  }

  it.each(SERVICES)('%s registers each cmd once', (svc) => {
    const counts = new Map<string, number>();
    for (const file of tsFiles(join(API, svc, 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/@MessagePattern\(\{\s*cmd:\s*'([^']+)'/g)) {
        counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      }
    }
    expect(counts.size).toBeGreaterThan(0);
    expect([...counts].filter(([, n]) => n > 1).map(([cmd]) => cmd)).toEqual([]);
  });
});
