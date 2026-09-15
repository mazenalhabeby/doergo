import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, normalizeLocale, PrismaService, type SupportedLocale } from '@hbcfield/shared';

/** Long enough that a burst of events costs one query; short enough that a language change lands within a minute on every replica. */
export const LOCALE_CACHE_TTL_MS = 60_000;
/** A ceiling, not a tuning knob: past it the cache is dropped and refills from the next queries. */
const MAX_CACHED = 20_000;

/**
 * Which language each recipient reads.
 *
 * Asked for every push and every bell entry, for everybody the event reaches —
 * so it is asked for a LIST and answered with one query for whatever the cache
 * does not already hold. A per-recipient lookup would put thirty round trips in
 * front of a push to thirty approvers.
 *
 * The cache is per process. A member who changes language on one replica is
 * written through to the database and forgotten here; another replica learns
 * it when its entry expires. A minute of the old language after switching is
 * an acceptable cost; a shared cache to avoid it is not.
 */
@Injectable()
export class RecipientLocales {
  private readonly logger = new Logger(RecipientLocales.name);
  private readonly cache = new Map<string, { locale: SupportedLocale; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async localesFor(userIds: Array<string | null | undefined>): Promise<Map<string, SupportedLocale>> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    const result = new Map<string, SupportedLocale>();
    const now = Date.now();
    const missing: string[] = [];

    for (const id of ids) {
      const hit = this.cache.get(id);
      if (hit && now - hit.at < LOCALE_CACHE_TTL_MS) result.set(id, hit.locale);
      else missing.push(id);
    }
    if (missing.length === 0) return result;

    try {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: missing } },
        select: { id: true, locale: true },
      });
      const found = new Map(rows.map((r: { id: string; locale: string | null }) => [r.id, r.locale]));
      if (this.cache.size + missing.length > MAX_CACHED) this.cache.clear();
      for (const id of missing) {
        const locale = normalizeLocale(found.get(id)) ?? DEFAULT_LOCALE;
        this.cache.set(id, { locale, at: now });
        result.set(id, locale);
      }
    } catch (error) {
      // A notification in English beats no notification. Not cached, so the
      // next event asks again rather than pinning everyone to the default.
      this.logger.error(`Could not load recipient locales: ${error}`);
      for (const id of missing) result.set(id, DEFAULT_LOCALE);
    }
    return result;
  }

  /**
   * Record the language a member's app reports. Only a language we have a
   * catalogue for is stored — anything else leaves what was there, because an
   * old or odd client must not be able to reset somebody back to English.
   */
  async set(userId: string, locale: unknown): Promise<SupportedLocale | null> {
    const normalized = normalizeLocale(locale);
    if (!userId || !normalized) return null;
    this.cache.set(userId, { locale: normalized, at: Date.now() });
    try {
      // updateMany, not update: a token registered for a user deleted a moment
      // ago must not throw out of a delivery path.
      await this.prisma.user.updateMany({ where: { id: userId }, data: { locale: normalized } });
    } catch (error) {
      this.logger.error(`Could not store locale for ${userId}: ${error}`);
    }
    return normalized;
  }

  /** Written elsewhere (the profile endpoint): forget it here so the next event reads it. */
  forget(userId: string): void {
    this.cache.delete(userId);
  }
}
