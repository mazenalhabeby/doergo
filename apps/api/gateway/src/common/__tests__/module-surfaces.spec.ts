import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { AVAILABLE_MODULES } from '@hbcfield/shared';

/*
  A module is bought by switching it on in a space, and the space is billed for
  it. So a space that has not switched it on must not be able to USE it — and
  three of them could.

  `assets` (€9 + a ladder), `tracking` (€25) and `time_tracking` (€25) carried no
  server gate at all: their controllers were reachable by any authenticated
  member of any organization. The navigation already hid them, which is the
  weaker half — the UI decides what is offered, the server decides what is
  possible, and only one of those is a boundary.

  This walks the gateway and reports a module whose routes exist with nothing
  asking for it.
*/

const GATEWAY = join(__dirname, '..', '..');

/** Modules with a controller of their own, and the file that must gate it. */
const MODULE_CONTROLLERS: Array<{ key: string; file: string }> = [
  { key: 'assets', file: 'modules/assets/assets.controller.ts' },
  { key: 'assets', file: 'modules/assets/asset-categories.controller.ts' },
  { key: 'tracking', file: 'modules/tracking/tracking.controller.ts' },
  { key: 'time_tracking', file: 'modules/attendance/attendance.controller.ts' },
  { key: 'checklists', file: 'modules/tasks/tasks.controller.ts' },
  { key: 'subtasks', file: 'modules/tasks/tasks.controller.ts' },
  { key: 'attachments', file: 'modules/tasks/tasks.controller.ts' },
];

describe('a module nobody bought cannot be used', () => {
  it.each(MODULE_CONTROLLERS)('$key is required in $file', ({ key, file }) => {
    const src = readFileSync(join(GATEWAY, file), 'utf8');
    expect(src).toContain(`@RequireModule('${key}')`);
  });

  it('gates clock-IN and leaves clock-OUT open', () => {
    /*
      Switching Time Tracking off mid-shift must not strand somebody clocked in.
      The same reasoning already applied to the `clock` Access Profile check, and
      the module has to follow it or the fix creates a worse bug than it closes.
    */
    const src = readFileSync(join(GATEWAY, 'modules/attendance/attendance.controller.ts'), 'utf8');
    const clockIn = src.slice(src.indexOf("@Post('clock-in')"), src.indexOf("@Post('clock-out')"));
    const clockOut = src.slice(src.indexOf("@Post('clock-out')"), src.indexOf("@Post('heartbeat')"));
    expect(clockIn).toContain("@RequireModule('time_tracking')");
    expect(clockOut).not.toContain('@RequireModule');
  });

  it('gates every write path a task feature has, not just one', () => {
    /*
      A checklist, a subtask and an attachment each have their OWN routes on the
      task controller — which is what makes them refusable without refusing the
      task they belong to. Gating the first and forgetting the rest would leave a
      workspace unable to ADD a checklist item and perfectly able to edit and
      delete them, which is not a boundary, it is a speed bump.
    */
    const src = readFileSync(join(GATEWAY, 'modules/tasks/tasks.controller.ts'), 'utf8');
    const routes: Array<[string, string]> = [
      ["@Post(':id/checklist')", 'checklists'],
      ["@Patch(':id/checklist/reorder')", 'checklists'],
      ["@Patch(':id/checklist/:itemId')", 'checklists'],
      ["@Delete(':id/checklist/:itemId')", 'checklists'],
      ["@Post(':id/subtasks')", 'subtasks'],
      ["@Post(':id/attachments/presign')", 'attachments'],
      ["@Post(':id/attachments')", 'attachments'],
      ["@Delete(':id/attachments/:attachmentId')", 'attachments'],
    ];
    for (const [route, key] of routes) {
      const at = src.indexOf(route);
      expect(at).toBeGreaterThan(-1);
      // The decorator sits immediately above the route it guards.
      expect(src.slice(Math.max(0, at - 200), at)).toContain(`@RequireModule('${key}')`);
    }
  });

  it('keeps the agile FIELDS on the field check, where they belong', () => {
    /*
      `sprintId`, `epicId`, `phaseId` and `storyPoints` arrive as fields of a task
      write, not as routes of their own — so they are refused one field at a time
      by `assertTaskFieldEntitlements`, on BOTH write paths. A whole-request gate
      here would make an unbought story point stop somebody creating a job.
    */
    const src = readFileSync(join(GATEWAY, 'modules/tasks/tasks.controller.ts'), 'utf8');
    for (const f of ['sprints', 'epics', 'phases', 'story_points']) expect(src).toContain(`'${f}'`);
    // Create and update, not just create.
    expect(src.match(/this\.assertTaskFieldEntitlements\(/g) ?? []).toHaveLength(2);
  });

  it('names only modules that exist', () => {
    // A gate on a key nobody sells refuses forever and explains nothing — the
    // mirror of the Apartment portal gate, which wanted a module the product
    // had already removed.
    const keys = new Set(AVAILABLE_MODULES.map((m) => m.key));
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (e === 'node_modules' || e === 'dist') continue;
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts') && !full.includes('__tests__')) {
          for (const m of readFileSync(full, 'utf8').matchAll(/@RequireModule\('([a-z_0-9]+)'\)/g)) {
            found.add(m[1]);
          }
        }
      }
    };
    walk(GATEWAY);
    for (const k of found) expect([...keys]).toContain(k);
  });
});
