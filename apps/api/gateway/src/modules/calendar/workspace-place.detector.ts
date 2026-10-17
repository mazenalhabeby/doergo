import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { lookupAdminPlace } from '../geo/geo-providers';

const SWEEP_EVERY_MS = 15 * 60_000;
const FIRST_SWEEP_MS = 60_000;
const PAGE = 50;
/** Between lookups — gentle on the geocoder's rate limit; a backfill of 200 workspaces takes ~1 min. */
const PAUSE_MS = 250;

/**
 * Where each workspace is, for its public holidays — looked up ONCE per map point.
 *
 * The geocoder lives here (the key does), so the gateway asks task-service which workspaces have a
 * map point that was never looked up (`holidayDetectedAt` NULL: new, moved, or from before this
 * existed), reads country + state for each, and hands the answer back to be stored. Nothing on the
 * calendar's read path geocodes.
 *
 * One path for every way a workspace comes to exist (the workspaces screen, onboarding, a platform
 * import): the sweep finds them all. Saving a workspace nudges it so the answer is there in seconds.
 * Two gateway replicas sweeping at once only repeat a lookup; the stored answer is the same.
 */
@Injectable()
export class WorkspacePlaceDetector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkspacePlaceDetector.name);
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;
  private running = false;
  private again = false;

  constructor(@Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.first = setTimeout(() => void this.sweep(), FIRST_SWEEP_MS);
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
  }

  onModuleDestroy(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  /** A workspace was saved: look it up now rather than at the next sweep. Never throws, never waits. */
  nudge(): void {
    if (this.running) {
      this.again = true;
      return;
    }
    void this.sweep();
  }

  async sweep(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let done = 0;
    try {
      for (let round = 0; round < 10; round++) {
        const res: any = await firstValueFrom(
          this.taskClient.send({ cmd: 'calendar_places_to_detect' }, { limit: PAGE }).pipe(timeout(10_000)),
        );
        const rows: { id: string; organizationId: string; lat: number; lng: number }[] = res?.data ?? [];
        if (!rows.length) break;
        for (const r of rows) {
          const place = await lookupAdminPlace(Number(r.lat), Number(r.lng));
          await firstValueFrom(
            this.taskClient
              .send(
                { cmd: 'calendar_set_detected_place' },
                {
                  organizationId: r.organizationId,
                  spaceId: r.id,
                  country: place?.country ?? null,
                  stateCode: place?.stateCode ?? null,
                  stateName: place?.stateName ?? null,
                },
              )
              .pipe(timeout(10_000)),
          );
          done++;
          await new Promise((ok) => setTimeout(ok, PAUSE_MS));
        }
        if (rows.length < PAGE) break;
      }
      if (done) this.logger.log(`Holiday places: looked up ${done} workspace(s)`);
    } catch (e) {
      this.logger.warn(`Holiday place sweep stopped: ${(e as Error).message}`);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        void this.sweep();
      }
    }
    return done;
  }
}
