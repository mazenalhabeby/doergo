import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, PrismaService } from '@hbcfield/shared';
import { RecipientLocales } from '../i18n/recipient-locales.service';
import { renderText, type LocalizedText } from '../i18n/translate';

/**
 * Persists in-app notifications so recipients see them in the bell whenever they
 * log in — not only if they happened to be online when the event fired. Writes to
 * the notification_deliveries table (channel SOCKET). Best-effort: a persistence
 * failure never breaks live delivery.
 *
 * The title and body are written in EACH RECIPIENT's language at the moment the
 * row is stored. The bell shows stored text, so a row written in English stays
 * English however the reader's app is set — rendering at read time would need
 * every screen that lists notifications to carry this catalogue too.
 */
@Injectable()
export class NotificationStore {
  private readonly logger = new Logger('NotificationStore');

  constructor(
    private readonly prisma: PrismaService,
    private readonly locales: RecipientLocales,
  ) {}

  async record(params: {
    recipientIds: Array<string | null | undefined>;
    organizationId?: string | null;
    eventType: string;
    text: LocalizedText;
    link?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const ids = [...new Set((params.recipientIds || []).filter((id): id is string => !!id))];
    if (!ids.length || !params.organizationId) return;
    try {
      const localeOf = await this.locales.localesFor(ids);
      // Rendered once per language, not once per recipient.
      const rendered = new Map<string, { title: string; body: string }>();
      const textFor = (id: string) => {
        const locale = localeOf.get(id) ?? DEFAULT_LOCALE;
        let text = rendered.get(locale);
        if (!text) {
          text = renderText(locale, params.text);
          rendered.set(locale, text);
        }
        return text;
      };
      const now = new Date();
      await this.prisma.notificationDelivery.createMany({
        data: ids.map((recipientId) => {
          const { title, body } = textFor(recipientId);
          return {
            recipientId,
            organizationId: params.organizationId as string,
            channel: 'SOCKET',
            status: 'DELIVERED',
            eventType: params.eventType,
            payload: {
              title,
              body,
              link: params.link ?? null,
              ...(params.data || {}),
            },
            sentAt: now,
            deliveredAt: now,
          };
        }),
      });
    } catch (error) {
      this.logger.error(`Failed to persist notifications: ${error}`);
    }
  }
}
