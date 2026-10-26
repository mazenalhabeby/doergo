"use client"

import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PageHeader } from "@/components/page/page-kit"

/** The page title (with the count), what the page is for, and its two actions: Recurring and New Task. */
export function TasksPageHeader({
  isLoading,
  total,
  showRecurringToggle,
  recurringView,
  onToggleRecurring,
  canCreateTasks,
  billingLocked,
  billingLockReason,
  onCreateTask,
}: {
  isLoading: boolean
  total: number
  showRecurringToggle: boolean
  recurringView: boolean
  onToggleRecurring: () => void
  canCreateTasks: boolean
  billingLocked: boolean
  billingLockReason: string | undefined
  onCreateTask: () => void
}) {
  const { t } = useTranslation()

  return (
    <PageHeader
      title={
        <>
          {t("tasks.page.heading")}
          {!isLoading && total > 0 && (
            <span className="ml-2 text-[22px] font-normal tabular-nums text-muted-foreground">{total}</span>
          )}
        </>
      }
      subtitle={t("tasks.page.subtitle")}
      actions={
        <>
          {/* Recurring view toggle (admins, with the Option) — pressed while the recurring list shows. */}
          {showRecurringToggle && (
            <Button
              size="pill"
              variant={recurringView ? "default" : "outline"}
              aria-pressed={recurringView}
              onClick={onToggleRecurring}
            >
              <Icon name="sync" />
              {t("tasks.page.recurring")}
            </Button>
          )}

          {/*
            Create Task — disabled while the account is read-only.

            The server already refuses the write with 402; this only moves the
            refusal to before the typing. A locked account with a bug in the
            hook is still locked.
          */}
          {canCreateTasks && (
            <Button
              size="pill"
              disabled={billingLocked}
              title={billingLocked ? billingLockReason : undefined}
              onClick={onCreateTask}
              data-tour="tasks-create"
            >
              <Icon name="plusLine" />
              {t("tasks.page.newTask")}
            </Button>
          )}
        </>
      }
    />
  )
}
