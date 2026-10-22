import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useAuth } from '../../contexts/auth-context';
import { OPTIONS_BEFORE_REQUESTS, requestsApi, type RequestOptions } from '../../lib/api/technicians';

/*
  WHAT THIS MEMBER MAY ASK FOR — read once, after the screen has drawn.

  ⚠️ The phone never DECIDES a kind: the server answers which ones are offered
  (the workspace's list, and REMOTE only to somebody allowed to work away from
  a site) and refuses a kind it did not offer. This only hides what would be
  refused.

  One answer per signed-in member, held for the session and refreshed at most
  every five minutes; the endpoint is also kept by the response cache, so the
  chooser works with no signal. Asked after the first paint, never on it.
*/
const FRESH_MS = 5 * 60_000;
let memo: { userId: string; at: number; value: RequestOptions } | null = null;
let inflight: Promise<RequestOptions> | null = null;

function load(userId: string): Promise<RequestOptions> {
  if (!inflight) {
    inflight = requestsApi.myOptions()
      .then((value) => { memo = { userId, at: Date.now(), value }; return value; })
      // No answer and nothing kept: the contract's default, so leave is still offered.
      .catch(() => (memo?.userId === userId ? memo.value : OPTIONS_BEFORE_REQUESTS))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useRequestOptions(enabled = true): { options: RequestOptions | null } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const held = memo && memo.userId === userId ? memo.value : null;
  const [options, setOptions] = useState<RequestOptions | null>(held);

  useEffect(() => {
    if (!enabled || !userId) return;
    if (memo && memo.userId === userId && Date.now() - memo.at < FRESH_MS) { setOptions(memo.value); return; }
    let live = true;
    const task = InteractionManager.runAfterInteractions(() => {
      void load(userId).then((v) => { if (live) setOptions(v); });
    });
    return () => { live = false; task.cancel(); };
  }, [enabled, userId]);

  return { options };
}
