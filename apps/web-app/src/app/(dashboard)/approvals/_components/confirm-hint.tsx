"use client"

import { useTranslation } from "react-i18next"

/**
 * Said aloud when a two-press button is pressed the first time ("Press again to confirm") — the button's own
 * label changes too, but a screen reader does not read a label change on the button it is already on.
 * Always rendered, so the live region exists before its words do; `id` lets the button name it as its
 * description (`aria-describedby`), so the hint is read again when the focus comes back to the button.
 */
export function ConfirmHint({ asking, id }: { asking: boolean; id?: string }) {
  const { t } = useTranslation()
  return (
    <span id={id} role="status" aria-live="polite" className="sr-only">
      {asking ? t("approvals.pressAgain") : ""}
    </span>
  )
}
