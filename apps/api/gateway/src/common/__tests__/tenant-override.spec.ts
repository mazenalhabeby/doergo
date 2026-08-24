import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Audit I-B1 — a request body must never be able to overwrite the tenant.
 *
 * Controllers build the microservice payload as an object literal that mixes
 * server-derived identity (`organizationId` from the verified token) with client
 * input. Order decides who wins:
 *
 *     { ...body, organizationId: req.user.organizationId }   // server wins  — safe
 *     { organizationId: req.user.organizationId, ...body }   // CLIENT wins  — hole
 *
 * The second shape was live on `PATCH .../portal/units/:unitId`. Because
 * `portal.service.updateUnit` scopes its lookup with
 * `findFirst({ id, organizationId })`, a manager in one organization could pass
 * another organization's id in the body and edit that organization's unit. The
 * body is typed `any`, so ValidationPipe's whitelist never stripped it.
 *
 * This scans the real controllers so the shape cannot come back.
 */
describe('a request body cannot overwrite the tenant (I-B1)', () => {
  const MODULES = join(__dirname, '..', '..', 'modules');

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith('.controller.ts') ? [full] : [];
    });

  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  /** Identity fields that must always come from the server. */
  const GUARDED = ['organizationId:', 'ownerOrgId:', 'guestOrgId:', 'createdById:', 'requesterId:'];

  /**
   * Only an UNTYPED body is dangerous. The global ValidationPipe runs with
   * `whitelist: true` and `forbidNonWhitelisted: true`, so spreading a typed DTO is
   * safe: an undeclared `organizationId` is rejected with a 400 before the handler
   * ever runs. `@Body() body: any` bypasses that entirely — which is exactly why
   * the portal unit handler was exploitable and the join-request handlers, with the
   * same spread-last shape, are not.
   */
  const untypedBodies = (src: string): Set<string> =>
    new Set([...src.matchAll(/@Body\(\)\s+(\w+)\s*:\s*any\b/g)].map((m) => m[1]!));

  const offenders = walk(MODULES).flatMap((file) => {
    const src = stripComments(readFileSync(file, 'utf8'));
    const untyped = untypedBodies(src);
    if (!untyped.size) return [];
    const hits: string[] = [];
    for (const m of src.matchAll(/\{([^{}]*\.\.\.\s*(\w+)\b[^{}]*)\}/g)) {
      const blk = m[1]!;
      const spreadVar = m[2]!;
      if (!untyped.has(spreadVar)) continue;
      const positions = GUARDED.filter((g) => blk.includes(g)).map((g) => blk.indexOf(g));
      if (!positions.length) continue;
      if (blk.indexOf('...') > Math.min(...positions)) {
        hits.push(
          `${file.split('/modules/')[1]} — untyped \`...${spreadVar}\` spread AFTER a server-set identity field`,
        );
      }
    }
    return hits;
  });

  it('scans a real set of controllers — a silent zero would prove nothing', () => {
    expect(walk(MODULES).length).toBeGreaterThan(20);
  });

  it('no controller lets the body land after a server-set identity field', () => {
    expect(offenders).toEqual([]);
  });
});
