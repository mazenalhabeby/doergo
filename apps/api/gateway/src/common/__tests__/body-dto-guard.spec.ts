import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { getMetadataStorage } from 'class-validator';

/*
  B3 (CODE_AUDIT.md): every whole-body `@Body()` is a class the global ValidationPipe can check —
  an interface, a `Record`, a union (`Dto | undefined`) or `unknown` all compile to `Object`,
  and the pipe then lets ANY shape through to a service. Walks every controller's metadata (what
  Nest itself reads), so a new route cannot quietly skip validation.

  The bodies below are loose ON PURPOSE: a shared parser is their validator and answers coded
  refusals a DTO would replace with a generic 400.
*/
const LOOSE_ON_PURPOSE: Record<string, string> = {
  'MemberCoverController.precheckRequest': 'read by the same shared request parser as sending',
  'CustomersController.importContacts': 'parseContactImport is the validator',
  'BlogController.update': 'the blogUpdate contract is an open record',
  'LegalEntitiesController.create': 'parseLegalEntity in auth-service (coded refusals)',
  'LegalEntitiesController.update': 'parseLegalEntity in auth-service (coded refusals)',
};

function controllerFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__') controllerFiles(p, out);
    } else if (name.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

type Ctor = new (...args: never[]) => unknown;

function bodyParams(ctrl: Ctor) {
  const found: { method: string; type: unknown }[] = [];
  for (const method of Object.getOwnPropertyNames(ctrl.prototype)) {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ctrl, method) as
      Record<string, { index: number; data?: unknown }> | undefined;
    if (!args) continue;
    const types = (Reflect.getMetadata('design:paramtypes', ctrl.prototype, method) ?? []) as unknown[];
    for (const [key, arg] of Object.entries(args)) {
      // `@Body()` only — `@Body('field')` validates one primitive, not the body's shape.
      if (key.split(':')[0] === String(RouteParamtypes.BODY) && arg.data === undefined) {
        found.push({ method, type: types[arg.index] });
      }
    }
  }
  return found;
}

const hasRules = (type: unknown) =>
  typeof type === 'function' &&
  type !== Object &&
  getMetadataStorage().getTargetValidationMetadatas(type as Ctor, '', true, false).length > 0;

describe('every request body is validated', () => {
  const root = join(__dirname, '..', '..', 'modules');
  const offenders: string[] = [];
  const seenLoose = new Set<string>();
  let checked = 0;

  for (const file of controllerFiles(root)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (typeof value !== 'function' || Reflect.getMetadata('path', value) === undefined) continue;
      const ctrl = value as Ctor;
      for (const { method, type } of bodyParams(ctrl)) {
        checked++;
        const name = `${ctrl.name}.${method}`;
        if (LOOSE_ON_PURPOSE[name]) {
          seenLoose.add(name);
          continue;
        }
        if (!hasRules(type)) offenders.push(`${name} (${relative(root, file)})`);
      }
    }
  }

  it('walks the controllers', () => {
    expect(checked).toBeGreaterThan(250);
  });

  it('has no unvalidated body outside the reviewed list', () => {
    expect(offenders).toEqual([]);
  });

  it('every reviewed exception still exists — a stale entry would hide a new one', () => {
    expect([...seenLoose].sort()).toEqual(Object.keys(LOOSE_ON_PURPOSE).sort());
  });
});
