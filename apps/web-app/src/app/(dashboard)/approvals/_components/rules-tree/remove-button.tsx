"use client"

import { useTranslation } from "react-i18next"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { useConfirmPress } from "../../_hooks/use-confirm-press"
import { ConfirmHint } from "../confirm-hint"

/**
 * The bin shows when the row is pointed at or focused (always on a touch screen, which cannot point), and deletes
 * only on a SECOND press — a rule is never lost to one stray tap.
 */
const BIN =
  "grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-muted-foreground opacity-0 transition-opacity " +
  "hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 " +
  "[@media(hover:none)]:opacity-100"

/** The theme's colour is a variable without an alpha channel: its tint is mixed, as the nodes' are. */
const ASKING =
  "bg-[color-mix(in_srgb,var(--shell-crit)_10%,transparent)] text-[12px] font-semibold text-shell-crit opacity-100"

type RemoveProps = { label: string; confirmLabel: string; busy?: boolean; onRemove: () => void }

/** A rule's delete: asks on the first press, deletes on the second. */
export function RemoveButton({ label, confirmLabel, busy, onRemove }: RemoveProps) {
  const { t } = useTranslation()
  const { asking, press, hintId } = useConfirmPress(onRemove)
  return (
    <>
      <button
        type="button"
        onClick={press}
        disabled={busy}
        aria-label={asking ? confirmLabel : label}
        aria-pressed={asking}
        aria-describedby={hintId}
        className={cn(BIN, "disabled:pointer-events-none disabled:opacity-50", asking && ASKING)}
      >
        {asking ? t("approvals.tree.confirmRemove") : <Icon name="trash" size={15} />}
      </button>
      <ConfirmHint id={hintId} asking={asking} />
    </>
  )
}
