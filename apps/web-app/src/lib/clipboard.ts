import { notify } from "@/lib/toast"

/**
 * Copy text — the ONE clipboard helper.
 *
 * Nine call sites wrote `navigator.clipboard.writeText(x)` and then said
 * "Copied" whatever happened. It rejects in an insecure context (plain http),
 * without focus, or under a browser permission refusal, and the reader then
 * pasted an old clipboard — an invitation code or a temporary password that
 * was never copied. Here a failure is reported and the caller gets `false`, so
 * a "Copied" tick is shown only for a copy that happened.
 *
 * Falls back to a hidden textarea + `execCommand("copy")` where the async API
 * is missing (older Safari, http on a LAN address).
 */
export async function copyText(text: string, opts: { silent?: boolean } = {}): Promise<boolean> {
  let ok = false
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      ok = true
    }
  } catch {
    ok = false
  }
  if (!ok) ok = legacyCopy(text)
  if (!ok && !opts.silent) notify.copyFailed()
  return ok
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false
  const el = document.createElement("textarea")
  el.value = text
  el.setAttribute("readonly", "")
  el.style.position = "fixed"
  el.style.opacity = "0"
  document.body.appendChild(el)
  try {
    el.select()
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    el.remove()
  }
}
