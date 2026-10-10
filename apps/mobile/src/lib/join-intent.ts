import { onSessionEnd } from './session/session-registry';

/**
 * "I'm with him" — the crew push's button, carried to the job page IN MEMORY.
 *
 * ⚠️ IT USED TO RIDE IN THE URL (`/task/<id>?sheet=join`), and the job page
 * joined the crew whenever it opened with that parameter. A URL is something
 * anybody can send: `hbcfield://task/<id>?sheet=join` in a chat message or on
 * a web page joined the member to that job — starting their time on it — with
 * one tap and no question. Joining is an act with consequences (it counts
 * time, it can pause a job), so only the app itself may ask for it, and only
 * right after the member pressed the button on the push.
 *
 * Armed by the notification handler, taken once by the job page for that same
 * task, and stale after two minutes — a launch that never reaches the page
 * must not leave a join waiting for the next time it is opened.
 */
export const JOIN_INTENT_TTL_MS = 2 * 60_000;

let armed: { taskId: string; at: number } | null = null;

/** The member pressed "I'm with him" on a push about this task. */
export function armCrewJoin(taskId: string, now: number = Date.now()): void {
  armed = taskId ? { taskId, at: now } : null;
}

/** True ONCE, for the task it was armed for, while still fresh. */
export function takeCrewJoin(taskId: string, now: number = Date.now()): boolean {
  const hit = !!armed && armed.taskId === taskId && now - armed.at <= JOIN_INTENT_TTL_MS;
  if (hit || (armed && now - armed.at > JOIN_INTENT_TTL_MS)) armed = null;
  return hit;
}

/** Is a join waiting for this task? (Does not consume it.) */
export function crewJoinArmed(taskId: string, now: number = Date.now()): boolean {
  return !!armed && armed.taskId === taskId && now - armed.at <= JOIN_INTENT_TTL_MS;
}

export function clearCrewJoin(): void {
  armed = null;
}

onSessionEnd('crew-join-intent', clearCrewJoin);
