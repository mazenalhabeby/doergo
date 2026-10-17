import { tasksControllerSource } from './tasks-controllers.fixture';

/**
 * A crew's checklist records WHO did the work (shared tasks/checklist.ts).
 * An external supervisor or observer watches the work — ticking it would put a
 * client's name on our record of who did it. Every checklist WRITE is closed
 * to them; a route added without it fails here.
 */
describe('checklist write routes', () => {
  const src = tasksControllerSource();
  const routes = [...src.matchAll(/@(Post|Patch|Delete)\(':id\/checklist[^']*'\)([\s\S]*?)async (\w+)\(/g)];

  it('finds them at all — a passing scan of nothing proves nothing', () => {
    expect(routes.length).toBeGreaterThanOrEqual(4);
  });

  it.each(routes.map((m) => [m[3], m[2]] as const))('%s is closed to external members', (_name, between) => {
    expect(between).toMatch(/@DenyExternal\(\)/);
  });
});
