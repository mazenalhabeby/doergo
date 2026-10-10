/**
 * May a push's BUTTON act as the member signed in now?
 *
 * A notification sits in the tray after its member signs out, and a button on
 * it ("Done", "+10 min", "Accept", "I'm with him") acts with whatever session
 * the phone holds when it is pressed — so the second person on a shared phone
 * could tick off the first person's reminder, or answer their invitation.
 *
 * Two answers, strongest first:
 *  1. The push names its recipient (`recipientId` / `recipientUserId`): it must
 *     be the member signed in now.
 *  2. ⚠️ TODAY'S SERVER SENDS NO RECIPIENT on calendar or crew pushes (adding
 *     one is a notification-service change). The fallback is time: a push that
 *     was DELIVERED before the current session began was meant for an earlier
 *     session — possibly somebody else's — and is refused. A push delivered
 *     during this session reached this phone while this member's token was the
 *     one registered, so it is theirs.
 *
 * Refusing is cheap — the member opens the app and does it there. Acting as the
 * wrong person is not.
 */
export interface PushActContext {
  /** The push's data. */
  data: Record<string, unknown> | null | undefined;
  /** When the OS delivered it (ms or s since epoch, as expo-notifications reports it), if known. */
  deliveredAt: number | null | undefined;
  /** The member signed in now. */
  userId: string | null | undefined;
  /** When the current session began (ms), if known. */
  sessionStartedAt: number | null | undefined;
}

/** expo-notifications reports seconds on some platforms and milliseconds on others. */
function asMs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

export function pushRecipient(data: Record<string, unknown> | null | undefined): string | null {
  const v = data?.recipientId ?? data?.recipientUserId;
  return typeof v === 'string' && v ? v : null;
}

export function mayActOnPush({ data, deliveredAt, userId, sessionStartedAt }: PushActContext): boolean {
  if (!userId) return false;
  const recipient = pushRecipient(data);
  if (recipient) return recipient === userId;
  if (typeof deliveredAt === 'number' && deliveredAt > 0 && typeof sessionStartedAt === 'number') {
    // A little slack: the clock that stamps delivery and the one that stamped sign-in are both the phone's.
    return asMs(deliveredAt) >= sessionStartedAt - 1000;
  }
  return true;
}
