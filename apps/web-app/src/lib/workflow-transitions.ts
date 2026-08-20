/**
 * Where each step of a hand-built flow can go next.
 *
 * The space's builder edits names, colours, the finished/cancelled marks and
 * the capabilities of each step — it has no transition control. That leaves two
 * ways to get transitions wrong, and both are silent:
 *
 *   - writing none at all, which the validator reads as a dead end and refuses
 *     the whole task type when somebody tries to offer it in a space;
 *   - synthesising a chain on every save, which flattens branching that came
 *     from a library template. A forked Field Service flow has Blocked → In
 *     Progress; regenerate it and a task sitting in Blocked has nowhere to go.
 *
 * So: keep what a step already declares, and invent a chain only for one that
 * declares nothing.
 *
 * Lives here rather than inside the component so the tests exercise the code
 * that actually runs. A copy of this logic in a spec file passes whatever the
 * component does.
 */

export interface TransitionStatus {
  name: string
  isFinal: boolean
  isCanceled: boolean
  transitions?: string[]
}

/** The key form the builder writes — must match what it sends as `key`. */
export function toStatusKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase()
}

/**
 * A straight chain: each working step to the next, plus the cancel step, which
 * is reachable from anywhere rather than sitting in the middle of the flow.
 */
export function linearTransitions(statuses: TransitionStatus[], index: number): string[] {
  const current = statuses[index]
  if (!current || current.isFinal || current.isCanceled) return []

  const out: string[] = []
  const next = statuses.slice(index + 1).find((s) => !s.isCanceled)
  if (next) out.push(toStatusKey(next.name))

  const cancel = statuses.find((s) => s.isCanceled)
  if (cancel && cancel !== current) out.push(toStatusKey(cancel.name))

  return out
}

/** Keep declared transitions; fall back to the chain only when there are none. */
export function resolveTransitions(statuses: TransitionStatus[], index: number): string[] {
  const existing = statuses[index]?.transitions
  if (existing && existing.length > 0) return existing
  return linearTransitions(statuses, index)
}
