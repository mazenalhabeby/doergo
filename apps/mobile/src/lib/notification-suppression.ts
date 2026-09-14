/**
 * A notification that has already been answered on this phone.
 *
 * The server decides from what it has received, and a phone with no signal has
 * sent it nothing: it still pushes "you haven't clocked in" to somebody whose
 * clock-in is sitting in the outbox. When that push lands, the phone knows
 * better. The offline layer registers the question; the notification handler
 * asks it before showing anything.
 *
 * A registry rather than an import so the push hook stays free of the offline
 * layer — it runs on builds that have none.
 */
export type NotificationSuppressor = (data: Record<string, unknown> | undefined, notifiedAt: number) => boolean;

let suppressor: NotificationSuppressor | null = null;

export function setNotificationSuppressor(next: NotificationSuppressor | null): void {
  suppressor = next;
}

export function isNotificationSuppressed(data: Record<string, unknown> | undefined, notifiedAt: number = Date.now()): boolean {
  try {
    return suppressor?.(data, notifiedAt) ?? false;
  } catch {
    // Never lose a notification to a bug in deciding whether to hide it.
    return false;
  }
}
