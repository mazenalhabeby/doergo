import type { ActionOutcome } from './outcome';

/**
 * A queued create that names its record answers `{ id, outcome, … }`, while
 * `useQueuedWrite().run` wants the outcome alone. `from(sent)` hands `run` the
 * outcome and keeps the whole answer — the phone's id, the operation — for the
 * screen to read in `value` afterwards. `value` stays null when there was no
 * engine and the direct call ran: the server's answer is the outcome's
 * `response` then, as it always was.
 */
export function keepCreated<T extends { outcome: ActionOutcome } = { id: string; outcome: ActionOutcome }>() {
  const kept = {
    value: null as T | null,
    async from(sent: Promise<T>): Promise<ActionOutcome> {
      const answer = await sent;
      kept.value = answer;
      return answer.outcome;
    },
  };
  return kept;
}
