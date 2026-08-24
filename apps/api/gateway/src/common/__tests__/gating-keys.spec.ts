import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { isAddOn, AVAILABLE_ADD_ONS, AVAILABLE_MODULES } from '@hbcfield/shared';

/**
 * Audit T-B1 — every gating key in the source must actually exist.
 *
 * `PlanGuard` fails closed: a key that is not a real add-on throws 402 rather than
 * granting the feature. That is the right default — a typo must not hand a paid
 * capability to everyone — but it means a WRONG key silently disables a working
 * feature for every organization, and the 402 it returns is indistinguishable from
 * a legitimate "you haven't bought this".
 *
 * That is exactly what happened. When the 2026-08-21 migration replaced tiers with
 * add-ons, `@RequirePlan('dependencies')` and `@RequirePlan('custom_fields')` were
 * left behind. Both are per-space MODULES, not org add-ons, so from that deploy
 * onward task dependencies and custom-field writes returned 402 to every customer,
 * including organizations on a full trial. Nobody noticed, because the response
 * looked like a billing state rather than a bug.
 *
 * These assertions read the actual decorators out of the source, so the next
 * mismatch fails here instead of in production.
 */
describe('gating decorators reference keys that exist (T-B1)', () => {
  const SRC = join(__dirname, '..', '..');

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full);
      return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
    });

  const files = walk(SRC);

  /**
   * Comments are stripped first. `plan.guard.ts` documents the failure mode with a
   * deliberately misspelled `@RequirePlan('reccuring')`, and a scanner that counts
   * prose as code reports the documentation as the bug.
   */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  /** Every `@RequireX('key')` in the source, with the file it came from. */
  const decoratorKeys = (decorator: string): { key: string; file: string }[] => {
    const re = new RegExp(`@${decorator}\\(\\s*'([^']+)'`, 'g');
    return files.flatMap((file) => {
      const src = stripComments(readFileSync(file, 'utf8'));
      return [...src.matchAll(re)].map((m) => ({ key: m[1]!, file: file.slice(SRC.length + 1) }));
    });
  };

  const MODULE_KEYS = new Set(AVAILABLE_MODULES.map((m) => m.key));

  it('finds the decorators at all — a silent zero would make this suite meaningless', () => {
    expect(decoratorKeys('RequirePlan').length).toBeGreaterThan(0);
    expect(decoratorKeys('RequireModule').length).toBeGreaterThan(0);
  });

  it('every @RequirePlan key is a real org add-on', () => {
    const bad = decoratorKeys('RequirePlan').filter(({ key }) => !isAddOn(key));
    expect(
      bad.map(({ key, file }) => `@RequirePlan('${key}') in ${file}`),
    ).toEqual([]);
  });

  it('every @RequireModule key is a real space module', () => {
    const bad = decoratorKeys('RequireModule').filter(({ key }) => !MODULE_KEYS.has(key as any));
    expect(
      bad.map(({ key, file }) => `@RequireModule('${key}') in ${file}`),
    ).toEqual([]);
  });

  it('no key is declared as both an add-on and a module — the two guards would disagree', () => {
    const addOns = new Set(AVAILABLE_ADD_ONS.map((a) => a.key));
    const both = [...MODULE_KEYS].filter((k) => addOns.has(k as any));
    expect(both).toEqual([]);
  });
});
