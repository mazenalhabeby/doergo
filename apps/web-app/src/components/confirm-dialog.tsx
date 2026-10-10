"use client"

import type { MouseEventHandler, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

/** The red the product has always used for a destructive confirm. */
export const DESTRUCTIVE_CONFIRM_CLASS = "bg-red-600 hover:bg-red-700"

export interface ConfirmDialogProps {
  /** Controlled open state; leave both out when a `trigger` opens it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Rendered inside the dialog root, for a dialog opened by an `AlertDialogTrigger`. */
  trigger?: ReactNode
  title: ReactNode
  description: ReactNode
  confirmLabel: ReactNode
  /**
   * The Action's click. Radix closes the dialog after it unless the handler
   * calls `e.preventDefault()` — a caller that waits for its mutation does so.
   */
  onConfirm?: MouseEventHandler<HTMLButtonElement>
  /** Defaults to "Cancel"; `null` leaves the Cancel button out. */
  cancelLabel?: ReactNode | null
  /** Red Action. */
  destructive?: boolean
  /** Disables both buttons and puts a spinner before the confirm label. */
  pending?: boolean
  /** Explicit overrides, for callers that disable only one button or draw their own progress. */
  confirmDisabled?: boolean
  cancelDisabled?: boolean
  titleClassName?: string
  descriptionClassName?: string
  confirmClassName?: string
  cancelClassName?: string
  /** Anything between the text and the buttons (a checkbox, a note). */
  children?: ReactNode
}

/**
 * The confirm step before an action: title, description, Cancel and the
 * Action. Every confirm in the app used to write this markup out by hand.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  cancelLabel,
  destructive,
  pending,
  confirmDisabled,
  cancelDisabled,
  titleClassName,
  descriptionClassName,
  confirmClassName,
  cancelClassName,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={titleClassName}>{title}</AlertDialogTitle>
          <AlertDialogDescription className={descriptionClassName}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          {cancelLabel !== null && (
            <AlertDialogCancel className={cancelClassName} disabled={cancelDisabled ?? pending}>
              {cancelLabel ?? t("common.cancel")}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            className={cn(destructive && DESTRUCTIVE_CONFIRM_CLASS, confirmClassName)}
            onClick={onConfirm}
            disabled={confirmDisabled ?? pending}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
