"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { useAuth } from "@/contexts/auth-context"
import { billingApi } from "@/lib/api"
import type { OrgCostBreakdown, SubscriptionView } from "@hbcfield/shared/client"

/** The billing page's data — the subscription and the bill, loaded together — and its actions. */
export function useBillingPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [sub, setSub] = useState<SubscriptionView | null>(null)
  const [bill, setBill] = useState<OrgCostBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    // Both together: the status comes from Stripe's view of the subscription,
    // the bill from what the organization has. Neither is derivable from the
    // other, and a page showing one without the other is half an answer.
    const [s, b] = await Promise.all([billingApi.getSubscription(), billingApi.getBill()])
    setSub(s)
    setBill(b)
  }, [])

  useEffect(() => {
    load()
      .catch((e) => notify.error(errorMessage(e, t("toast.billingLoadFailed", "Couldn't load billing details."))))
      .finally(() => setLoading(false))
  }, [load, t])

  /**
   * `done` is what to say when the action finishes HERE rather than at Stripe.
   *
   * Most of these redirect, so the message is never seen. Starting invoicing
   * does not — it creates the subscription server-side and comes back — and it
   * said "Billing updated.", which is true of everything on this page and
   * describes nothing. Somebody who has just started being invoiced wants to
   * know an invoice is coming.
   */
  const go = async (fn: () => Promise<{ url?: string } | void>, key: string, done?: string) => {
    setBusy(key)
    try {
      const res = await fn()
      if (res && "url" in res && res.url) {
        window.location.href = res.url
        return
      }
      await load()
      notify.success(done ?? t("toast.billingUpdated", "Billing updated."))
    } catch (e) {
      notify.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const saveAddOns = async (keys: string[]) => {
    try {
      await billingApi.setAddOns(keys)
      // Re-read rather than patching local state: the bill moves with the
      // add-ons, and a total the page computed itself is exactly the drift this
      // model exists to remove.
      await load()
      notify.success(t("toast.addOnsUpdated", "Options updated."))
    } catch (e) {
      notify.error(errorMessage(e))
      throw e
    }
  }

  return {
    isAdmin,
    sub,
    bill,
    loading,
    busy,
    go,
    saveAddOns,
  }
}
