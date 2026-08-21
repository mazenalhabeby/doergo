import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AssetsController } from '../assets.controller';

/**
 * Express matches routes in DECLARATION order, so a static path declared after
 * a parameter path on the same prefix is dead: `@Get(':id')` swallows
 * `/assets/usage` and answers "Asset not found in this organization" for an id
 * of "usage".
 *
 * This has already been shipped once here, and it is invisible in review —
 * both routes look right, and only their order is wrong. So the order is
 * asserted from the metadata Nest actually registers, not from the source text:
 * moving the method below `:id` fails this test.
 */
const getRoutes = (target: any): string[] =>
  Object.getOwnPropertyNames(target.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => target.prototype[name])
    .filter((fn) => typeof fn === 'function' && Reflect.getMetadata(METHOD_METADATA, fn) === RequestMethod.GET)
    .map((fn) => Reflect.getMetadata(PATH_METADATA, fn) as string);

describe('asset route order', () => {
  const routes = getRoutes(AssetsController);

  it('declares every static GET before the parameter route that would swallow it', () => {
    const paramIndex = routes.indexOf(':id');
    expect(paramIndex).toBeGreaterThan(-1);

    const swallowed = routes
      .map((path, index) => ({ path, index }))
      .filter(({ path, index }) => index > paramIndex && !path.startsWith(':') && !path.includes('/'));

    expect(swallowed.map((s) => s.path)).toEqual([]);
  });

  it('reaches /assets/usage rather than reading it as an asset id', () => {
    expect(routes.indexOf('usage')).toBeGreaterThan(-1);
    expect(routes.indexOf('usage')).toBeLessThan(routes.indexOf(':id'));
  });
});
