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
