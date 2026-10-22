import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/auth-context';
import { useSocketContext } from '../../contexts/socket-context';
import { shiftIssuesApi } from '../../lib/api/shift-issues';
import { groupIssues, unreadFor } from './issue-status';

/**
 * HOW MANY OF THE MEMBER'S ISSUES HAVE A REPLY WAITING.
 *
 * ⚠️ THE BADGE IS UNREAD, NEVER A TOTAL — rule 10, and this is the number it
 * names. `"5 updates"` is the wrong question: a thread with five of the
 * member's own messages has nothing waiting in it, and a badge that counts
 * those teaches somebody to ignore the badge. The question is whether anybody
 * replied to *you*.
 *
 * ⚠️ AND IT IS THE SAME NUMBER THE LIST SHOWS. The disc badge and the row pill
 * both come from `unreadFor`, so a member who sees `2` on the card and opens
 * the sheet finds two rows carrying a pill. Two counters for one idea is how
 * they drift by one and stop being believed.
 *
 * ⚠️ IT COUNTS ISSUES, NOT MESSAGES. Three replies on one fault is one thing
 * to go and look at.
 */
export function useUnreadIssues(enabled: boolean): number {
  const { user } = useAuth();
  const { subscribe } = useSocketContext();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) { setCount(0); return; }
    try {
      const issues = await shiftIssuesApi.list();
      /*
        Only the ones still open. A resolved fault with an unread note on it is
        not something anybody has to act on, and badging it would put a number
        on the card that cannot be cleared by doing anything useful.
      */
      const { open } = groupIssues(issues);
      setCount(open.filter((i) => unreadFor(i, user?.id) > 0).length);
    } catch {
      /*
        ⚠️ SILENT, AND THE BADGE STAYS WHERE IT WAS. This is a courtesy count on
        a card whose real job is the clock — a failed list must never become an
        error on the surface somebody uses to start their day.
      */
    }
  }, [enabled, user?.id]);

  useEffect(() => { void load(); }, [load]);

  /* Live: a reply arriving while the card is on screen moves the badge. */
  useEffect(() => {
    if (!enabled) return;
    const offs = [subscribe('shift_issue.event', () => void load()), subscribe('shift_issue.created', () => void load())];
    return () => offs.forEach((o) => o());
  }, [enabled, subscribe, load]);

  return count;
}
