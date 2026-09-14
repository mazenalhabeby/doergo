/**
 * A new profile photo — or its removal — waiting for signal.
 *
 * The photo travels as a multipart upload the server cannot replay from the
 * outbox, so it does not go there. And only the LATEST choice matters: somebody
 * who picks a photo, changes their mind and removes it in a basement means
 * "no photo", not an upload followed by a delete. One slot, newest wins, sent
 * when a connection returns.
 */

export type AvatarChange =
  | { kind: 'photo'; fileId: string; uri: string; mime: string; fileName: string; at: number }
  | { kind: 'remove'; at: number };

export interface PendingAvatarDeps {
  storage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };
  upload(uri: string, fileName: string, mime: string): Promise<unknown>;
  remove(): Promise<unknown>;
  /** Forget a kept photo once it has been sent or replaced. */
  forgetFile(fileId: string): Promise<void>;
  isUnreachable(err: unknown): boolean;
}

export const PENDING_AVATAR_KEY = (memberId: string) => `pending_avatar_v1_${memberId}`;

export function createPendingAvatar(memberId: string, deps: PendingAvatarDeps) {
  const key = PENDING_AVATAR_KEY(memberId);
  const listeners = new Set<(change: AvatarChange | null) => void>();
  let sending: Promise<'sent' | 'waiting' | 'refused' | 'none'> | null = null;

  const read = async (): Promise<AvatarChange | null> => {
    try {
      const raw = await deps.storage.getItem(key);
      return raw ? (JSON.parse(raw) as AvatarChange) : null;
    } catch {
      return null;
    }
  };
  const write = async (change: AvatarChange | null) => {
    if (change) await deps.storage.setItem(key, JSON.stringify(change));
    else await deps.storage.removeItem(key);
    listeners.forEach((l) => l(change));
  };

  return {
    current: read,

    /** Replace whatever was waiting with this choice. */
    async set(change: AvatarChange): Promise<void> {
      const previous = await read();
      if (previous?.kind === 'photo' && (change.kind !== 'photo' || previous.fileId !== change.fileId)) {
        await deps.forgetFile(previous.fileId).catch(() => undefined);
      }
      await write(change);
    },

    /** Send the waiting choice. `waiting` when there is still no signal. */
    flush(): Promise<'sent' | 'waiting' | 'refused' | 'none'> {
      if (sending) return sending;
      sending = (async () => {
        const change = await read();
        if (!change) return 'none';
        try {
          if (change.kind === 'photo') await deps.upload(change.uri, change.fileName, change.mime);
          else await deps.remove();
        } catch (err) {
          if (deps.isUnreachable(err)) return 'waiting';
          // Refused (too large, wrong type): it will never be accepted, so it does not wait.
          if (change.kind === 'photo') await deps.forgetFile(change.fileId).catch(() => undefined);
          if ((await read())?.at === change.at) await write(null);
          return 'refused';
        }
        if (change.kind === 'photo') await deps.forgetFile(change.fileId).catch(() => undefined);
        // A newer choice made while this one was sending stays waiting.
        if ((await read())?.at === change.at) await write(null);
        return 'sent';
      })().finally(() => {
        sending = null;
      });
      return sending;
    },

    subscribe(listener: (change: AvatarChange | null) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type PendingAvatar = ReturnType<typeof createPendingAvatar>;
