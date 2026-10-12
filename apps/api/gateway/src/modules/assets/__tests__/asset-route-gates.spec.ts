import { Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PERMISSIONS_KEY, PERMISSIONS_IN_SPACE_KEY, Role, assetSpaces } from '@hbcfield/shared';
import { DENY_EXTERNAL_KEY } from '../../../common/decorators/deny-external.decorator';
import { AssetsController } from '../assets.controller';
import { AssetCategoriesController, AssetTypesController } from '../asset-categories.controller';
import { assetActor } from '../asset-actor';

/**
 * Every asset route, walked from the metadata Nest actually registers.
 *
 * The register is honoured PER WORKSPACE at three levels — `canViewAssets`,
 * `canLogAssets`, `canManageAssets` — and the guard is only the door: the
 * request names a record, not a workspace, so the SERVICE narrows by the
 * record's kind. This pins the two halves the gateway owns:
 *
 *   1. No asset route asks `canViewAllTasks` any more. That is the task grant
 *      an External Observer holds to follow the work; while the register rode
 *      on it, sight of a site was sight of the organization's equipment.
 *   2. Every gated route asks a register key IN SPACE and forwards the
 *      caller's workspaces (`assetActor`) for the service to narrow with —
 *      except the named few below, each with its reason.
 *
 * A new route that fits none of this fails here rather than in production.
 */
const reflector = new Reflector();
const LEVEL_KEYS = ['canViewAssets', 'canLogAssets', 'canManageAssets'];

type Route = {
  controller: string;
  name: string;
  path: string;
  method: RequestMethod;
  permissions?: string[];
  inSpace?: string[];
  denyExternal: boolean;
  source: string;
};

const routesOf = (target: any): Route[] =>
  Object.getOwnPropertyNames(target.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({ name, fn: target.prototype[name] }))
    .filter(({ fn }) => typeof fn === 'function' && Reflect.getMetadata(METHOD_METADATA, fn) !== undefined)
    .map(({ name, fn }) => ({
      controller: target.name,
      name,
      path: Reflect.getMetadata(PATH_METADATA, fn) as string,
      method: Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod,
      permissions: reflector.get<string[]>(PERMISSIONS_KEY, fn),
      inSpace: reflector.get<string[]>(PERMISSIONS_IN_SPACE_KEY, fn),
      denyExternal: Reflect.getMetadata(DENY_EXTERNAL_KEY, fn) === true,
      source: fn.toString(),
    }));

const CONTROLLERS = [AssetsController, AssetCategoriesController, AssetTypesController];
const ROUTES = CONTROLLERS.flatMap(routesOf);

/*
  Routes with NO permission decorator, and why that is the authorization.
  Each is decided in the service from the caller's own id or custody.
*/
const OWN_OR_CUSTODY: Record<string, string> = {
  mine: 'what the caller holds — the filter is the authorization',
  myExpenses: 'the caller’s own expenses',
  myLog: 'the caller’s own logbook entries',
  myDue: 'what is due on what the caller holds',
  receiptUrl: 'the author, or a reader of that record’s workspace (service)',
  proposalUploadUrl: 'a member’s own page',
  raiseProposal: 'a member raises one for themselves',
  myProposals: 'the caller’s own proposals',
  withdrawProposal: 'the caller’s own, while it waits',
  proposalDocumentUrl: 'the sender, or a reviewer whose queue shows it (service)',
  presignReceipt: 'custody on the receipt’s date, or canLogAssets in the record’s workspace (service)',
  readReceipt: 'the same custody gate as filing',
  submitExpense: 'the same custody gate as filing',
  presignLog: 'custody, or canLogAssets / canManageAssets in the record’s workspace (service)',
  createLog: 'custody, or canLogAssets / canManageAssets in the record’s workspace (service)',
  removeLog: 'the author’s own waiting entry, or the record’s workspace manager (service)',
};

/*
  ORG-WIDE on purpose: what they return is in NO workspace (orphans) or is the
  organization's bill (usage). No workspace grant can reach either, and the
  service refuses anything short of org-wide as well.
*/
const ORG_WIDE: Record<string, string> = {
  listOrphans: 'records in no workspace',
  billingUsage: 'the organization’s billable counts',
};

/*
  The organization's own custody system for its staff — and its bill. An
  external member holds no custody, so these stay closed to them whatever
  keys they hold. Everything else follows their keys, in their workspace.
*/
const DENY_EXTERNAL = [
  'mine', 'myExpenses', 'myDue', 'receiptUrl',
  'proposalUploadUrl', 'raiseProposal', 'myProposals', 'pendingProposals',
  'acceptProposal', 'rejectProposal', 'withdrawProposal', 'proposalDocumentUrl',
  'presignReceipt', 'readReceipt', 'submitExpense',
  'listOrphans', 'billingUsage',
].sort();

describe('asset routes are gated per workspace on the register’s own keys', () => {
  it('finds the routes to check', () => {
    // Guards the guard: a broken walk would make every check below vacuous.
    expect(ROUTES.length).toBeGreaterThan(50);
  });

  it.each(ROUTES.map((r) => [`${r.controller}.${r.name}`, r]))('%s never asks canViewAllTasks', (_n, r) => {
    const route = r as Route;
    expect(route.permissions ?? []).not.toContain('canViewAllTasks');
    expect(route.inSpace ?? []).not.toContain('canViewAllTasks');
  });

  it.each(ROUTES.map((r) => [`${r.controller}.${r.name}`, r]))('%s is gated in space, or named with its reason', (_n, r) => {
    const route = r as Route;
    if (route.name in OWN_OR_CUSTODY) {
      expect(route.permissions).toBeUndefined();
      expect(route.inSpace).toBeUndefined();
      return;
    }
    if (route.name in ORG_WIDE) {
      expect(route.permissions).toEqual(['canViewAssets']);
      expect(route.inSpace).toBeUndefined();
      return;
    }
    expect(route.permissions).toBeUndefined();
    expect(route.inSpace).toHaveLength(1);
    expect(LEVEL_KEYS).toContain(route.inSpace![0]);
  });

  /*
    The narrowing half: a gated route that forwarded nothing would leave the
    service with no workspaces — which it reads as NOWHERE, so the failure is a
    refusal, not a leak. Still a bug: this catches it before a user does.
  */
  it.each(ROUTES.filter((r) => !(r.name in OWN_OR_CUSTODY)).map((r) => [`${r.controller}.${r.name}`, r]))(
    '%s forwards the caller’s workspaces',
    (_n, r) => {
      expect((r as Route).source).toContain('assetActor');
    },
  );

  it('a write is never gated on the read key', () => {
    const readGatedWrites = ROUTES
      .filter((r) => r.method !== RequestMethod.GET && (r.inSpace ?? r.permissions ?? []).includes('canViewAssets'))
      .map((r) => r.name);
    expect(readGatedWrites).toEqual([]);
  });

  it('closes exactly the staff-custody routes (and the bill) to external members', () => {
    const closed = ROUTES.filter((r) => r.denyExternal).map((r) => r.name).sort();
    expect(closed).toEqual(DENY_EXTERNAL);
  });

  it('no asset controller is closed to external members as a whole any more', () => {
    for (const c of CONTROLLERS) expect(Reflect.getMetadata(DENY_EXTERNAL_KEY, c)).toBeUndefined();
  });

  it('every route the logging level opens is one an external member may reach', () => {
    // canLogAssets is how an external member logs; nothing that grants it may be closed to them.
    for (const name of ['presignLog', 'createLog', 'removeLog', 'myLog']) {
      expect(ROUTES.find((r) => r.name === name)!.denyExternal).toBe(false);
    }
  });
});

describe('assetActor — who is asking, from the verified session', () => {
  const req = (user: Record<string, unknown>) => ({ user: { id: 'u', organizationId: 'o', role: Role.EMPLOYEE, ...user } });

  it('carries each level as the shared rule resolves it, null kept as null', () => {
    const a = assetActor(req({ access: { org: {}, perSpace: { s1: { canViewAssets: true }, s2: { canManageAssets: true } } } }));
    expect(a).toMatchObject({
      userId: 'u', organizationId: 'o', isExternal: false,
      viewSpaceIds: expect.arrayContaining(['s1', 's2']),
      logSpaceIds: ['s2'],
      manageSpaceIds: ['s2'],
      canManageAssets: false,
    });
    const admin = assetActor(req({ role: Role.ADMIN }));
    expect(admin.viewSpaceIds).toBeNull();
    expect(admin.manageSpaceIds).toBeNull();
    expect(admin.canManageAssets).toBe(true);
  });

  it('never reads canViewAllTasks as sight of the register', () => {
    const a = assetActor(req({ access: { org: {}, perSpace: { s1: { canViewAllTasks: true } } } }));
    expect(a.viewSpaceIds).toEqual([]);
  });

  it('marks an external member, from the session only', () => {
    expect(assetActor(req({ isExternal: true })).isExternal).toBe(true);
    expect(assetActor(req({ isExternal: 'true' })).isExternal).toBe(false);
  });

  it('agrees with the shared rule a screen renders with', () => {
    const user = { role: Role.EMPLOYEE, canViewAssets: true, access: { org: {}, perSpace: {} } };
    expect(assetActor({ user }).viewSpaceIds).toEqual(assetSpaces(user, 'view'));
  });
});
