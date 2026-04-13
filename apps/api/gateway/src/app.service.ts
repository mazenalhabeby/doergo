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

  private async pingService(client: ClientProxy, name: string): Promise<{ status: string; latencyMs?: number }> {
    const start = Date.now();
    try {
      await firstValueFrom(
        client.send({ cmd: 'health' }, {}).pipe(
          timeout(3000),
          catchError(() => of(null)),
        ),
      );
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down' };
    }
  }
}
