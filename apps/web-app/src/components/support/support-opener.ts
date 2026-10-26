/**
 * "Help and support" from anywhere (the account menu) opens THE support widget — the one button in the top bar
 * that is on screen. A tiny listener list rather than a context: the widget keeps its own state, and nothing
 * else has to be wrapped in a provider for one call.
 */
type Open = () => boolean

const openers = new Set<Open>()

/** The widget registers; each opener answers whether it opened (only a visible one does). */
export function onOpenSupport(open: Open): () => void {
  openers.add(open)
  return () => {
    openers.delete(open)
  }
}

export function openSupport(): boolean {
  for (const open of openers) if (open()) return true
  return false
}
