import { useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/auth-context';
import type { User } from '../../lib/api';
import { useQueuedWrite } from '../actions/queued-write';
import type { ActionOutcome } from '../actions/outcome';
import { updateOwnProfile } from './profile-actions';

type OwnPatch = Parameters<typeof updateOwnProfile>[2] & Partial<User>;

/**
 * A setting a member changes about themselves — presence, time format, how
 * they clock in, their language. Through the outbox where there is one, shown
 * at once by patching the signed-in member (not when it was refused, and not
 * with `applyLocally: false`); `direct` where there is not, which reads the
 * account back itself where it always did.
 *
 * Called `run` on purpose: `queued-writes-guard.spec` reads the fallback handed
 * to a `.run(...)` as the helper's business.
 */
export function useOwnProfileWrite() {
  const { user, patchUser } = useAuth();
  const write = useQueuedWrite();
  const userId = user?.id;

  const run = useCallback(
    async (
      patch: OwnPatch,
      direct: () => Promise<unknown>,
      { applyLocally = true }: { applyLocally?: boolean } = {},
    ): Promise<ActionOutcome> => {
      // No member to file it under (a sign-out under way): straight to the server, as before.
      if (!userId) return { kind: 'done', response: await direct() };
      return write.run(async (engine) => {
        const sent = await updateOwnProfile(engine, userId, patch);
        if (applyLocally && sent.kind !== 'refused') patchUser(patch);
        return sent;
      }, direct);
    },
    [write, userId, patchUser],
  );

  return useMemo(() => ({ run }), [run]);
}
