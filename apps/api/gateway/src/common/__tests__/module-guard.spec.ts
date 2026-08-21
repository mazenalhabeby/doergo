import { HttpException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '@hbcfield/shared';
import { ModuleGuard } from '../guards/module.guard';
import { MODULE_KEY } from '../decorators/require-module.decorator';

/**
 * Modules are configured PER SPACE, with the organization's set as the fallback.
 *
 * The guard used to ask the organization for both questions, off the cached
 * token. That made a space's Modules tab decorative everywhere except the
 * workflow gate: switching Checklists off in one space still let its endpoints
 * accept writes, because the organization had it on. These assert the scope, and
 * the two directions it has to get right — a space that switched something OFF
 * and a space that switched something ON.
 */
describe('ModuleGuard — the space decides, and only the space', () => {
  const ORG = 'org-1';

  const ctx = (req: any) => ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as any;

  /*
    Keyed on the real metadata constants.

    A first version of this matched the key by substring and got the case wrong,
    so every call answered the module question — including "is this route
    public?", which made the guard exit early and four tests pass while
    asserting nothing. A double that lies produces a test that lies.
  */
  const reflector = (required: string | undefined) =>
    ({
      getAllAndOverride: (key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === MODULE_KEY) return required;
        return undefined;
      },
    }) as any;

  const resolver = (
    spaces: Record<string, string[]>,
    taskSpace: Record<string, string> = {},
    planningSpace: Record<string, string> = {},
  ) =>
    ({
      forSpace: async (spaceId: string) => spaces[spaceId] ?? null,
      spaceOfTask: async (taskId: string) => taskSpace[taskId] ?? null,
      spaceOfPlanningObject: async (_cmd: string, id: string) => planningSpace[id] ?? null,
      invalidate: () => {},
    }) as any;

  const user = { organizationId: ORG, planTier: 'business', orgModules: ['checklists', 'sprints'] };

  it('lets a read through even when the module is off', async () => {
    // A downgrade must not make existing work unreadable.
    const g = new ModuleGuard(reflector('checklists'), resolver({ 'sp-1': [] }));
    await expect(g.canActivate(ctx({ method: 'GET', user, body: { spaceId: 'sp-1' } }))).resolves.toBe(true);
  });

  it("refuses a write when the SPACE has it off, though the organization has it on", async () => {
    const g = new ModuleGuard(reflector('checklists'), resolver({ 'sp-1': ['attachments'] }));
    await expect(
      g.canActivate(ctx({ method: 'POST', user, body: { spaceId: 'sp-1' } })),
    ).rejects.toThrow(HttpException);
  });

  it("allows a write when the SPACE has it on, though the organization does not", async () => {
    // The other direction, and the one a fallback-only implementation fails.
    const orgWithout = { ...user, orgModules: [] };
    const g = new ModuleGuard(reflector('checklists'), resolver({ 'sp-1': ['checklists'] }));
    await expect(
      g.canActivate(ctx({ method: 'POST', user: orgWithout, body: { spaceId: 'sp-1' } })),
    ).resolves.toBe(true);
  });

  it('resolves the space from the task when the request only names a task', async () => {
    const g = new ModuleGuard(
      reflector('checklists'),
      resolver({ 'sp-9': [] }, { 't-1': 'sp-9' }),
    );
    await expect(
      g.canActivate(ctx({ method: 'PATCH', user, params: { id: 't-1' }, url: '/api/v1/tasks/t-1' })),
    ).rejects.toThrow(HttpException);
  });

  it('does not read `:id` as a task outside /tasks', async () => {
    // `:id` means a different thing in every controller. Treating it as a task
    // id would resolve the wrong space — or somebody else's.
    const g = new ModuleGuard(reflector('checklists'), resolver({}, { 'x-1': 'sp-9' }));
    await expect(
      g.canActivate(ctx({ method: 'PATCH', user, params: { id: 'x-1' }, url: '/api/v1/locations/x-1' })),
    ).resolves.toBe(true);
  });

  it('falls back to the organization when no space is in play', async () => {
    const g = new ModuleGuard(reflector('checklists'), resolver({}));
    await expect(g.canActivate(ctx({ method: 'POST', user }))).resolves.toBe(true);

    const without = { ...user, orgModules: [] };
    await expect(g.canActivate(ctx({ method: 'POST', user: without }))).rejects.toThrow(HttpException);
  });

  it('falls back rather than failing closed when the space cannot be resolved', async () => {
    // A slow or broken lookup must not take a working feature from everyone.
    const g = new ModuleGuard(reflector('checklists'), resolver({}));
    await expect(
      g.canActivate(ctx({ method: 'POST', user, body: { spaceId: 'sp-unknown' } })),
    ).resolves.toBe(true);
  });

  it('lets a space grant a module regardless of any tier the caller carries', async () => {
    /*
      This asserted the opposite until the tier model was removed, and the
      reversal is the point of the new pricing: switching a module on in a space
      IS the purchase, and the space is billed for it. Asking a tier as well
      meant asking the same question of two tables that could disagree.

      A legacy `planTier` may still be sitting on a cached token for up to the
      auth-cache TTL after the switch — it must be ignored, not obeyed.
    */
    const legacyStarter = { ...user, planTier: 'starter' };
    const g = new ModuleGuard(reflector('sprints'), resolver({ 'sp-1': ['sprints'] }));
    await expect(
      g.canActivate(ctx({ method: 'POST', user: legacyStarter, body: { spaceId: 'sp-1' } })),
    ).resolves.toBe(true);
  });

  it('still refuses a module the space switched OFF, whatever the tier says', async () => {
    // The other direction, and the one that protects the bill: a space that has
    // not switched something on is not paying for it and cannot use it.
    const legacyEnterprise = { ...user, planTier: 'enterprise' };
    const g = new ModuleGuard(reflector('sprints'), resolver({ 'sp-1': [] }));
    await expect(
      g.canActivate(ctx({ method: 'POST', user: legacyEnterprise, body: { spaceId: 'sp-1' } })),
    ).rejects.toThrow(HttpException);
  });

  it('passes a route with no module requirement', async () => {
    const g = new ModuleGuard(reflector(undefined), resolver({}));
    await expect(g.canActivate(ctx({ method: 'POST', user }))).resolves.toBe(true);
  });

  it('resolves the space from a sprint, phase or epic', async () => {
    // These were the last routes that could not be judged against a space: the
    // models were organization-owned, so there was nothing to resolve.
    for (const [segment, mod] of [['/sprints/', 'sprints'], ['/phases/', 'phases'], ['/epics/', 'epics']] as const) {
      const g = new ModuleGuard(reflector(mod), resolver({ 'sp-9': [] }, {}, { 'p-1': 'sp-9' }));
      await expect(
        g.canActivate(ctx({ method: 'PATCH', user, params: { id: 'p-1' }, url: `/api/v1${segment}p-1` })),
      ).rejects.toThrow(HttpException);
    }
  });

  it('treats an organization-wide planning object as the organization`s', async () => {
    // A null spaceId means organization-wide — what every row created before
    // spaces owned these still is. It must not read as "lookup failed".
    const g = new ModuleGuard(reflector('sprints'), resolver({}, {}, {}));
    await expect(
      g.canActivate(ctx({ method: 'PATCH', user, params: { id: 'p-legacy' }, url: '/api/v1/sprints/p-legacy' })),
    ).resolves.toBe(true);
  });

  it('judges a task by ITS space, not by a spaceId in the request body', async () => {
    /*
      Guards run before validation pipes, so this reads the raw body — including
      fields a DTO would strip a moment later. If the body won, a mutation on a
      task in a space with the module OFF could be judged against a space that
      has it on.
    */
    const g = new ModuleGuard(
      reflector('checklists'),
      resolver({ 'sp-off': [], 'sp-on': ['checklists'] }, { 't-1': 'sp-off' }),
    );
    await expect(
      g.canActivate(
        ctx({ method: 'PATCH', user, params: { id: 't-1' }, body: { spaceId: 'sp-on' }, url: '/api/v1/tasks/t-1' }),
      ),
    ).rejects.toThrow(HttpException);
  });

  it('still uses an explicit spaceId when there is no resource yet', async () => {
    // Creation: the body IS the target, and there is nothing else to ask.
    const g = new ModuleGuard(reflector('checklists'), resolver({ 'sp-1': [] }));
    await expect(
      g.canActivate(ctx({ method: 'POST', user, body: { spaceId: 'sp-1' }, url: '/api/v1/tasks' })),
    ).rejects.toThrow(HttpException);
  });
});
