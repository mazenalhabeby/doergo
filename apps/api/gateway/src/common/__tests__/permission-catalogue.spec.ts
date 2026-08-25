import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { PERMISSION_KEYS, ACCESS_PERMISSION_SCHEMA } from '@hbcfield/shared';

/**
 * The permission vocabulary must stay one vocabulary.
 *
 * Two flags had quietly become the whole authorization model — `canManageUsers`
 * gated 129 endpoints and `canViewAllTasks` 81 — so "can manage members" also
 * meant "can invoice customers and delete assets", and no organization could
 * separate them. Nothing failed while that accumulated; each new endpoint simply
 * reached for the nearest flag that was already true for the right people.
 *
 * These assertions make the drift visible: every key a route requires must exist
 * in the catalogue, every catalogue key must be describable in the UI, and the
 * concentration of endpoints on any single key is reported so the next one cannot
 * creep to 129 unremarked.
 */
describe('permission catalogue', () => {
  const MODULES = join(__dirname, '..', '..', 'modules');

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = join(dir, e);
      return statSync(full).isDirectory()
        ? walk(full)
        : full.endsWith('.controller.ts')
          ? [full]
          : [];
    });

  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const required = walk(MODULES).flatMap((f) =>
    [
      ...stripComments(readFileSync(f, 'utf8')).matchAll(
        /@RequirePermission(?:InSpace)?\(([^)]*)\)/g,
      ),
    ].flatMap((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((k) => k[1]!)),
  );

  it('scans real controllers', () => {
    expect(walk(MODULES).length).toBeGreaterThan(20);
    expect(required.length).toBeGreaterThan(50);
  });

  it('every permission a route requires exists in the catalogue', () => {
    const unknown = [...new Set(required)].filter(
      (k) => !(PERMISSION_KEYS as readonly string[]).includes(k),
    );
    expect(unknown).toEqual([]);
  });

  it('every catalogue key has a label and a description for the Access tab', () => {
    const described = new Set(ACCESS_PERMISSION_SCHEMA.map((p) => p.key));
    const undescribed = PERMISSION_KEYS.filter((k) => !described.has(k));
    expect(undescribed).toEqual([]);
    for (const p of ACCESS_PERMISSION_SCHEMA) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.description.length).toBeGreaterThan(10);
    }
  });

  it('invoicing and asset administration are their own capabilities, not a share of another', () => {
    // The specific conflation this split fixed: a bookkeeper needed invoicing but
    // not member management; an HR manager needed the reverse.
    const keys = PERMISSION_KEYS as readonly string[];
    expect(keys).toContain('canManageInvoices');
    expect(keys).toContain('canManageAssets');
    expect(required).toContain('canManageInvoices');
    expect(required).toContain('canManageAssets');
  });

  it('reports how concentrated the model is, so the next flag cannot quietly become the model', () => {
    const counts = new Map<string, number>();
    for (const k of required) counts.set(k, (counts.get(k) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line no-console
    console.log(
      '  endpoints per permission: ' +
        ranked.map(([k, n]) => `${k}=${n}`).join('  '),
    );
    // Not a threshold on purpose — a number here would be arbitrary. What matters
    // is that more than one key is doing real work.
    expect(ranked.filter(([, n]) => n >= 3).length).toBeGreaterThanOrEqual(3);
  });
});
