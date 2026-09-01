import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable } from 'rxjs';

/**
 * Remember which build of the app each member is running.
 *
 * There was no answer to this anywhere in the system. On 2026-08-31 a crash
 * took out every Play Store user, and "who is affected" and "who still needs to
 * update" could not be asked — the only appVersion column in the schema was on
 * document_events, which only 1.0.3 and later ever write. Notifying people
 * became a broadcast to everybody, because nobody could be told apart.
 *
 * Three things keep this off the critical path:
 *
 *   It EMITS, never sends. The request does not wait, and a dropped event is
 *   harmless — the next request from that phone carries the same header.
 *
 *   It dedupes in memory first. A version is forwarded once per process per
 *   user, so the steady state is a Map lookup and nothing else. Replicas each
 *   keep their own map, which costs at most one redundant event per replica.
 *
 *   The service writes only on change. Even a forwarded event that turns out to
 *   be redundant performs no write.
 *
 * The header is client-supplied and therefore untrusted; the service validates
 * its shape and bounds its length before it reaches the database. Nothing is
 * authorised on the strength of it — it is a fact about a phone, not a claim
 * about a person.
 */
@Injectable()
export class AppVersionInterceptor implements NestInterceptor {
  /**
   * userId → the version last forwarded for them.
   *
   * Bounded so a long-lived process cannot grow one entry per user forever.
   * When it fills it is cleared wholesale rather than evicted one by one: the
   * cost of being wrong is a repeated event, so precision buys nothing here.
   */
  private readonly seen = new Map<string, string>();
  private static readonly MAX_TRACKED = 10_000;

  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    try {
      const req = context.switchToHttp().getRequest();
      const version = req?.headers?.['x-app-version'];
      const userId = req?.user?.id;

      if (userId && typeof version === 'string' && version.length > 0 && version.length <= 32) {
        if (this.seen.get(userId) !== version) {
          if (this.seen.size >= AppVersionInterceptor.MAX_TRACKED) this.seen.clear();
          this.seen.set(userId, version);

          const rawPlatform = req.headers['x-app-platform'];
          const platform = rawPlatform === 'ios' || rawPlatform === 'android' ? rawPlatform : undefined;

          this.authClient.emit('app_version_seen', { userId, version, platform });
        }
      }
    } catch {
      // Bookkeeping must never break a request.
    }

    return next.handle();
  }
}
