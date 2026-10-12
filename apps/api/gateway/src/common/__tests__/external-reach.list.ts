import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { IS_PUBLIC_KEY, ROLES_KEY, PERMISSIONS_KEY, PERMISSIONS_IN_SPACE_KEY } from '@hbcfield/shared';
import { DENY_EXTERNAL_KEY } from '../decorators/deny-external.decorator';

/** Every gateway route, as Nest registers it, with what decides who may call it. */
export interface RouteFacts {
  id: string; // Controller.method
  verb: string;
  path: string;
  isPublic: boolean;
  denyExternal: boolean;
  roles?: string[];
  permissions?: string[];
  inSpace?: string[];
}

const meta = (key: string, fn: object, cls: object) => Reflect.getMetadata(key, fn) ?? Reflect.getMetadata(key, cls);

export function allRoutes(): RouteFacts[] {
  const root = path.resolve(__dirname, '../../modules');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); }
      else if (e.name.endsWith('.controller.ts')) files.push(p);
    }
  };
  walk(root);
  const out: RouteFacts[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file);
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function' || Reflect.getMetadata(PATH_METADATA, exported) === undefined) continue;
      const cls = exported as any;
      const base = String(Reflect.getMetadata(PATH_METADATA, cls) ?? '');
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const fn = cls.prototype[name];
        if (name === 'constructor' || typeof fn !== 'function' || Reflect.getMetadata(METHOD_METADATA, fn) === undefined) continue;
        out.push({
          id: `${cls.name}.${name}`,
          verb: RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn)],
          path: `/${base}/${String(Reflect.getMetadata(PATH_METADATA, fn) ?? '')}`.replace(/\/+/g, '/').replace(/\/$/, ''),
          isPublic: meta(IS_PUBLIC_KEY, fn, cls) === true,
          denyExternal: meta(DENY_EXTERNAL_KEY, fn, cls) === true,
          roles: meta(ROLES_KEY, fn, cls),
          permissions: meta(PERMISSIONS_KEY, fn, cls),
          inSpace: meta(PERMISSIONS_IN_SPACE_KEY, fn, cls),
        });
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Could a signed-in EXTERNAL member (role EMPLOYEE, no org role) get past the decorators? */
export function externalPassesDecorators(r: RouteFacts): boolean {
  if (r.isPublic || r.denyExternal) return false;
  if (r.roles?.length && !r.roles.includes('EMPLOYEE')) return false;
  // An org-wide permission: an external member holds no org role, so never.
  if (r.permissions?.length) return false;
  return true;
}
