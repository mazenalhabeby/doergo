import { NEVER, of, throwError } from 'rxjs';
import { AppService } from '../../app.service';

/**
 * The gateway's health answer.
 *
 * A timeout was swallowed into `null` and reported "ok", so a dead dependency
 * read healthy; and the three services shared one pattern, so a reply
 * could come from the wrong one. Neither may pass as a clean bill of health.
 */
describe('AppService.getHealth', () => {
  const client = (reply: any) => ({ send: jest.fn(() => reply) });

  beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  it('is ok when each service answers as itself', async () => {
    const svc = new AppService(
      client(of({ status: 'ok', service: 'auth-service' })) as any,
      client(of({ status: 'ok', service: 'task-service' })) as any,
      client(of({ status: 'ok', service: 'tracking-service' })) as any,
    );
    const h = await svc.getHealth();
    expect(h.status).toBe('ok');
    expect(h.dependencies.task).toMatchObject({ status: 'ok', verified: true });
  });

  it('asks each service on its own pattern', async () => {
    const a = client(of({ service: 'auth-service' }));
    const t = client(of({ service: 'task-service' }));
    const r = client(of({ service: 'tracking-service' }));
    await new AppService(a as any, t as any, r as any).getHealth();
    expect(a.send).toHaveBeenCalledWith({ cmd: 'auth_health' }, {});
    expect(t.send).toHaveBeenCalledWith({ cmd: 'task_health' }, {});
    expect(r.send).toHaveBeenCalledWith({ cmd: 'tracking_health' }, {});
  });

  it('reports a timeout as down, not ok', async () => {
    const svc = new AppService(
      client(of({ status: 'ok', service: 'auth-service' })) as any,
      client(NEVER) as any,
      client(throwError(() => new Error('boom'))) as any,
    );
    const pending = svc.getHealth();
    await jest.advanceTimersByTimeAsync(3_100);
    const h = await pending;
    expect(h.status).toBe('degraded');
    expect(h.dependencies.task.status).toBe('down');
    expect(h.dependencies.tracking.status).toBe('down');
  });

  it('says so when another service answered (a misrouted transport)', async () => {
    const svc = new AppService(
      client(of({ status: 'ok', service: 'task-service' })) as any,
      client(of({ status: 'ok', service: 'task-service' })) as any,
      client(of({ status: 'ok', service: 'tracking-service' })) as any,
    );
    const h = await svc.getHealth();
    expect(h.dependencies.auth).toMatchObject({ verified: false, answeredBy: 'task-service' });
  });
});
