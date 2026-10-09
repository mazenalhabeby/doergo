import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { of } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';

@Injectable()
export class AppService {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
    @Inject(SERVICE_NAMES.TRACKING) private readonly trackingClient: ClientProxy,
  ) {}

  async getHealth() {
    const [auth, task, tracking] = await Promise.all([
      this.pingService(this.authClient, 'auth-service'),
      this.pingService(this.taskClient, 'task-service'),
      this.pingService(this.trackingClient, 'tracking-service'),
    ]);

    const allOk = auth.status === 'ok' && task.status === 'ok' && tracking.status === 'ok';

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'api-gateway',
      dependencies: { auth, task, tracking },
    };
  }

  /**
   * One dependency's answer.
   *
   * ⚠️ Two things this cannot know, and says so rather than guessing:
   *  - the three services all answer the SAME pattern (`{ cmd: 'health' }`) on
   *    the shared Redis transport, so whichever replies first answers for the
   *    one asked. The reply names its service; when it names another, the
   *    dependency is reported `verified: false` with who answered. Unique
   *    patterns need a change in each service (auth / task / tracking).
   *  - a timeout used to be swallowed into `null` and reported "ok", so a dead
   *    service read healthy. No answer is now "down".
   */
  private async pingService(
    client: ClientProxy,
    name: string,
  ): Promise<{ status: string; latencyMs?: number; verified?: boolean; answeredBy?: string }> {
    const start = Date.now();
    const reply: any = await firstValueFrom(
      client.send({ cmd: 'health' }, {}).pipe(
        timeout(3000),
        catchError(() => of(null)),
      ),
    ).catch(() => null);
    if (!reply) return { status: 'down' };
    const latencyMs = Date.now() - start;
    const answeredBy = typeof reply.service === 'string' ? reply.service : undefined;
    if (answeredBy && answeredBy !== name) return { status: 'ok', latencyMs, verified: false, answeredBy };
    return { status: 'ok', latencyMs, verified: true };
  }
}
