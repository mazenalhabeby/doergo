import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  BUILTIN_ROLES,
  builtInRoleCatchUp,
  builtInRoleGrants,
  endOfLocalDay,
  tzOffsetMs,
  zonedInputToUtc,
  zonedWallTimeToUtc,
} from '@hbcfield/shared';
import { SpaceRolesService } from '../../modules/space-roles/space-roles.service';

/** Rules that existed twice and drifted, now asked once. */
describe('one rule, not a copy of it', () => {
  describe('built-in roles follow their definition (builtInRoleCatchUp)', () => {
    const def = BUILTIN_ROLES.find((r) => Object.keys(builtInRoleGrants(r)).length > 1)!;
    const granted = builtInRoleGrants(def);
    const [first] = Object.keys(granted);

    it('adds what the definition grants and the stored role lacks — and keeps everything else', () => {
      const stored = { ...granted, extraFromAMigration: true } as Record<string, unknown>;
      delete stored[first!];
      const next = builtInRoleCatchUp({ slug: def.slug, isSystem: true, isCustomized: false, permissions: stored });
      expect(next).toMatchObject({ ...granted, extraFromAMigration: true });
    });

    it('never touches a role an admin edited, a custom role, or one already complete', () => {
      const lacking = {};
      expect(builtInRoleCatchUp({ slug: def.slug, isSystem: true, isCustomized: true, permissions: lacking })).toBeNull();
      expect(builtInRoleCatchUp({ slug: def.slug, isSystem: false, isCustomized: false, permissions: lacking })).toBeNull();
      expect(builtInRoleCatchUp({ slug: 'mine', isSystem: true, isCustomized: false, permissions: lacking })).toBeNull();
      expect(builtInRoleCatchUp({ slug: def.slug, isSystem: true, isCustomized: false, permissions: granted })).toBeNull();
    });

    it('task-service’s seeding UPDATES a stale built-in instead of only inserting', async () => {
      const prisma: any = {
        accessRole: {
          upsert: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([
            { id: 'r1', slug: def.slug, isSystem: true, isCustomized: false, permissions: {} },
          ]),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      await (new SpaceRolesService(prisma) as any).ensureBuiltInRoles('org-1');
      expect(prisma.accessRole.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org-1', isSystem: true, isCustomized: false });
      expect(prisma.accessRole.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { permissions: granted } });
    });
  });

  describe('one zone offset (attendance/zoned-time)', () => {
    const zones = ['Europe/Vienna', 'America/New_York', 'Asia/Kolkata'];
    // Either side of the October clock change in Vienna and New York.
    const walls = ['2026-10-25T01:30', '2026-10-25T03:30', '2026-11-01T01:30', '2026-07-01T12:00'];

    it.each(zones)('the web input conversion agrees with the backend in %s', (tz) => {
      for (const w of walls) {
        const [d, t] = w.split('T') as [string, string];
        const [h, m] = t.split(':').map(Number) as [number, number];
        expect(zonedInputToUtc(w, tz)).toBe(zonedWallTimeToUtc(d, h, m, tz).toISOString());
      }
    });

    it('a crew hand-over "for today" still ends at local midnight across a clock change', () => {
      const end = endOfLocalDay(new Date('2026-10-25T10:00:00Z'), 'Europe/Vienna');
      // 25 Oct is 25 hours long in Vienna: it ends at 23:00 UTC (CET, +1).
      expect(end.toISOString()).toBe('2026-10-25T22:59:59.999Z');
      expect(tzOffsetMs(new Date(end.getTime() + 1), 'Europe/Vienna')).toBe(3_600_000);
    });

    it('an unknown zone in an input still falls back to local, not UTC', () => {
      expect(zonedInputToUtc('2026-10-09T10:00', 'Not/AZone')).toBe(new Date(2026, 9, 9, 10, 0).toISOString());
    });
  });

  it('task-service clamps list limits and pages only through clampListLimit / clampListPage', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== '__tests__') walk(p);
        } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
          readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
            if (/Math\.min\(/.test(line) && /\b(limit|take|pageSize)\b/i.test(line)) offenders.push(`${p}:${i + 1}`);
            if (/Math\.max\(\s*1\s*,\s*Number\([^)]*page/i.test(line)) offenders.push(`${p}:${i + 1}`);
          });
        }
      }
    };
    walk(join(__dirname, '..', '..'));
    expect(offenders).toEqual([]);
  });
});
