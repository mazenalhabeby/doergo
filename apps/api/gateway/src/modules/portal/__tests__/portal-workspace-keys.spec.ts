import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_IN_SPACE_KEY, PERMISSIONS_KEY, Role } from '@hbcfield/shared';
import { PortalAdminController } from '../portal-admin.controller';
import { PortalSetupController } from '../portal-setup.controller';
import { PortalResidentsController } from '../portal-residents.controller';
import { SpacePortalController } from '../space-portal.controller';
import { SpaceUnitsController, UnitDetailController } from '../space-units.controller';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { portalScope } from '../../../common/portal-scope';

/*
  The customer portal, honoured PER WORKSPACE.

  1. Every office portal route asks a PORTAL key — canViewPortal (read),
     canAnswerPortal (triage), canManagePortals (configure) — and never
     canViewAllTasks (an External Supervisor holds it to follow the WORK) or
     canManageUsers (a bridge, not a portal grant).
  2. A route that names no workspace in its path can only learn from the guard
     that the key is held SOMEWHERE, so it must hand the service the workspaces
     granting that SAME key (`portalScope(req.user, key)`), or check reach first
     (`assertManageReach`). Org-only routes (`@RequirePermission`) are exempt:
     the flat flag is org-wide by definition.
  3. A route that DOES name its workspace is decided for that workspace by the
     guard — proved below with an external member holding the keys in A only.
*/

const PORTAL_KEYS = ['canViewPortal', 'canAnswerPortal', 'canManagePortals'];
const CONTROLLERS: Array<[string, any, string]> = [
  ['portal-admin.controller.ts', PortalAdminController, 'PortalAdminController'],
  ['portal-setup.controller.ts', PortalSetupController, 'PortalSetupController'],
  ['portal-residents.controller.ts', PortalResidentsController, 'PortalResidentsController'],
  ['space-portal.controller.ts', SpacePortalController, 'SpacePortalController'],
  ['space-units.controller.ts', SpaceUnitsController, 'SpaceUnitsController'],
  ['space-units.controller.ts', UnitDetailController, 'UnitDetailController'],
];

type Route = { name: string; inSpace: string[]; orgOnly: string[]; handler: any };

function routesOf(controller: any): Route[] {
  const proto = controller.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor' && typeof proto[n] === 'function')
    .filter((n) => Reflect.getMetadata(METHOD_METADATA, proto[n]) !== undefined)
    .map((name) => ({
      name,
      handler: proto[name],
      inSpace: Reflect.getMetadata(PERMISSIONS_IN_SPACE_KEY, proto[name]) ?? [],
      orgOnly: Reflect.getMetadata(PERMISSIONS_KEY, proto[name]) ?? [],
    }));
}

/** The text of one handler: from its definition to the next class-level decorator. */
function handlerSource(file: string, className: string, method: string): string {
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const cls = code.slice(code.indexOf(`class ${className}`));
  const def = cls.search(new RegExp(`\\n  (async )?${method}\\(`));
  expect(def).toBeGreaterThan(-1);
  const rest = cls.slice(def + 1);
  const end = rest.search(/\n  @|\n}/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('every portal office route asks a portal key', () => {
  it.each(CONTROLLERS)('%s %s', (_file, controller) => {
    const routes = routesOf(controller);
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      const keys = [...r.inSpace, ...r.orgOnly];
      expect({ route: r.name, keys }).toEqual({ route: r.name, keys: expect.arrayContaining([expect.any(String)]) });
      for (const k of keys) {
        expect({ route: r.name, key: k, portal: PORTAL_KEYS.includes(k) }).toEqual({ route: r.name, key: k, portal: true });
      }
    }
  });
});

describe('a route that names no workspace narrows by the SAME key', () => {
  for (const [file, controller, className] of CONTROLLERS) {
    const base: string = Reflect.getMetadata(PATH_METADATA, controller);
    if (base.includes(':spaceId')) continue;
    for (const r of routesOf(controller)) {
      if (r.inSpace.length === 0) continue; // org-only flag: org-wide by definition
      it(`${className}.${r.name} → ${r.inSpace.join(', ')}`, () => {
        const src = handlerSource(file, className, r.name);
        for (const key of r.inSpace) {
          const narrowed =
            src.includes(`portalScope(req.user, '${key}')`) ||
            (key === 'canManagePortals' && src.includes('this.assertManageReach('));
          expect({ route: r.name, key, narrowed }).toEqual({ route: r.name, key, narrowed: true });
        }
        // Never narrowed by a DIFFERENT key than the one the guard asked.
        for (const other of PORTAL_KEYS.filter((k) => !r.inSpace.includes(k))) {
          expect({ route: r.name, other, used: src.includes(`portalScope(req.user, '${other}')`) }).toEqual({
            route: r.name,
            other,
            used: false,
          });
        }
      });
    }
  }
});

describe('the guard decides a workspace route for THAT workspace', () => {
  const guard = new PermissionsGuard(new Reflector());
  const run = (handler: any, cls: any, user: any, params: Record<string, string> = {}, body: any = {}) =>
    guard.canActivate({
      getHandler: () => handler,
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => ({ user, params, body }) }),
    } as any);

  // An external member given the portal for workspace A — view, answer, manage.
  const externalInA = {
    id: 'x1',
    role: Role.EMPLOYEE,
    isExternal: true,
    access: { org: {}, perSpace: { A: { canViewPortal: true, canAnswerPortal: true, canManagePortals: true } } },
  };

  it('reads and configures A', () => {
    expect(run(SpaceUnitsController.prototype.list, SpaceUnitsController, externalInA, { spaceId: 'A' })).toBe(true);
    expect(run(SpacePortalController.prototype.update, SpacePortalController, externalInA, { spaceId: 'A' })).toBe(true);
  });

  it('cannot reach B — not to read, not to configure', () => {
    expect(() => run(SpaceUnitsController.prototype.list, SpaceUnitsController, externalInA, { spaceId: 'B' })).toThrow(ForbiddenException);
    expect(() => run(SpacePortalController.prototype.get, SpacePortalController, externalInA, { spaceId: 'B' })).toThrow(ForbiddenException);
    expect(() => run(SpacePortalController.prototype.update, SpacePortalController, externalInA, { spaceId: 'B' })).toThrow(ForbiddenException);
    expect(() => run(SpaceUnitsController.prototype.update, SpaceUnitsController, externalInA, { spaceId: 'B', unitId: 'u' })).toThrow(ForbiddenException);
  });

  it('cannot triage a request INTO B (the destination is read by the guard)', () => {
    expect(() =>
      run(PortalAdminController.prototype.triageRequest, PortalAdminController, externalInA, { id: 't' }, { spaceId: 'B' }),
    ).toThrow(ForbiddenException);
    expect(run(PortalAdminController.prototype.triageRequest, PortalAdminController, externalInA, { id: 't' }, { spaceId: 'A' })).toBe(true);
  });

  it('cannot create an organization-level portal (org-wide key only)', () => {
    expect(() => run(PortalAdminController.prototype.createPortal, PortalAdminController, externalInA)).toThrow(ForbiddenException);
  });

  it('a viewer cannot answer or configure', () => {
    const viewer = { id: 'v', role: Role.EMPLOYEE, access: { org: {}, perSpace: { A: { canViewPortal: true } } } };
    expect(run(SpaceUnitsController.prototype.list, SpaceUnitsController, viewer, { spaceId: 'A' })).toBe(true);
    expect(() => run(SpaceUnitsController.prototype.create, SpaceUnitsController, viewer, { spaceId: 'A' })).toThrow(ForbiddenException);
    expect(() =>
      run(PortalAdminController.prototype.triageRequest, PortalAdminController, viewer, { id: 't' }, { spaceId: 'A' }),
    ).toThrow(ForbiddenException);
  });

  it('canViewAllTasks alone no longer opens the units directory', () => {
    const supervisor = { id: 's', role: Role.EMPLOYEE, isExternal: true, access: { org: {}, perSpace: { A: { canViewAllTasks: true } } } };
    expect(() => run(SpaceUnitsController.prototype.list, SpaceUnitsController, supervisor, { spaceId: 'A' })).toThrow(ForbiddenException);
    expect(() => run(UnitDetailController.prototype.get, UnitDetailController, supervisor, { id: 'u' })).toThrow(ForbiddenException);
  });
});

describe('portalScope', () => {
  it('admin and the org flag (bridges included) are org-wide', () => {
    expect(portalScope({ role: Role.ADMIN }, 'canManagePortals')).toBeUndefined();
    expect(portalScope({ role: Role.EMPLOYEE, canViewPortal: true, access: { org: {}, perSpace: {} } }, 'canViewPortal')).toBeUndefined();
  });

  it('a space grant narrows to exactly the spaces granting THAT key', () => {
    const user = {
      role: Role.EMPLOYEE,
      access: { org: {}, perSpace: { A: { canViewPortal: true, canAnswerPortal: true }, B: { canViewPortal: true } } },
    };
    expect(portalScope(user, 'canViewPortal')).toEqual(['A', 'B']);
    expect(portalScope(user, 'canAnswerPortal')).toEqual(['A']);
    expect(portalScope(user, 'canManagePortals')).toEqual([]);
  });

  it('no session reaches nothing', () => {
    expect(portalScope(undefined, 'canViewPortal')).toEqual([]);
  });
});
