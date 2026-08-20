import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A global guard's dependencies must be reachable from EVERY module.
 *
 * Nest constructs an APP_GUARD that has dependencies once per module with
 * controllers, resolving them in THAT module's injector. A provider listed only
 * in AppModule is therefore missing everywhere else, and the app refuses to
 * boot — naming whichever module happens to be first, which said nothing about
 * the actual cause.
 *
 * This shipped. It typechecked, and the guard's own unit tests passed, because
 * they construct the guard directly with a double — a unit test cannot see
 * wiring. Only starting the application can, so this asserts the two structural
 * facts that make starting it work.
 */
describe('ModuleGuard is wired so every module can construct it', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
  const spaceModules = read('common/space-modules.service.ts');
  const appModule = read('app.module.ts');

  it('provides the resolver from a @Global() module', () => {
    expect(spaceModules).toMatch(/@Global\(\)/);
    expect(spaceModules).toMatch(/export class SpaceModulesModule/);
    // Global only helps if the module actually exports it.
    expect(spaceModules).toMatch(/exports:\s*\[SpaceModulesService\]/);
  });

  it('imports that module in AppModule', () => {
    expect(appModule).toMatch(/SpaceModulesModule/);
    expect(appModule).toMatch(/imports:\s*\[[\s\S]*?SpaceModulesModule/);
  });

  it('does not list the service as a bare AppModule provider', () => {
    // Which is what it was, and why it failed: a provider in AppModule's
    // `providers` is not visible to PhasesModule's injector.
    expect(appModule).not.toMatch(/^\s*SpaceModulesService,\s*$/m);
  });
});
