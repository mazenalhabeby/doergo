"use client"

import { useAuth } from "@/contexts/auth-context"

/**
 * Is this organization read-only because of billing?
 *
 * The server already refuses every write with 402 — the lock is real and
 * enforced there. What was missing is the app KNOWING: New Task, Clock In and
 * Add member all rendered normally, so somebody opened a dialog, filled it in
 * and only found out at submit. It was reported as "I can still add tasks in an
 * inactive organization"; every one of those writes had in fact been refused.
 *
 * `subStatus` rides on the user the gateway already resolved per request, so
 * this costs nothing — no query, no extra state.
 *
 * ⚠️ This is a COURTESY, never a boundary. It disables controls so the refusal
 * arrives before the typing; `SubscriptionGuard` is what actually stops the
 * write, and it must stay the thing relied upon. A locked account with a bug in
 * this hook is still locked.
 */
export function useBillingLock(): { locked: boolean; reason: string } {
  const { user } = useAuth()
  const status = (user as { subStatus?: string } | null)?.subStatus
  // The same two statuses `isLocked()` names on the server. Written out rather
  // than imported so the client cannot drift into locking on `past_due`, which
  // Stripe is still retrying and which must NOT stop anybody working.
  const locked = status === "incomplete" || status === "canceled"
  return {
    locked,
    reason: "This account is read-only until payment is set up.",
  }
}
