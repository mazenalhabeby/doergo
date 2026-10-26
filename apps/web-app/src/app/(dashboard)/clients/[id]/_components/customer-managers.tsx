"use client"

import { personInitials, personName } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { UserPlus, X, Check, Users, Star } from "lucide-react"

import { customersApi, type Customer } from "@/lib/api"
import type { AssignablePerson } from "@/lib/assignable-members"
import { useAssignableMembers } from "@/hooks/use-assignable-members"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Panel, PANEL_HEAD, SMALL_PILL } from "./customer-record-bits"

/** Assigned sales managers for a CRM customer. Hidden once the customer has app
 *  access (handled by the caller) — an app customer is self-serve. */
export function ManagersPanel({
  customer,
  ownerId,
  onChanged,
  canEdit = true,
}: {
  customer: Customer
  ownerId?: string
  onChanged: () => void
  /** Who manages a client is `manage`-level on the server (CustomersService.update). */
  canEdit?: boolean
}) {
  const { t } = useTranslation()
  // The directory for whoever may read it, else the client's workspace roster
  // (or the rosters this person can see) — lib/assignable-members.ts.
  const membersQ = useAssignableMembers({ spaceId: customer.spaceId })
  const members = membersQ.members.filter((m) => m.isActive !== false && m.role !== "CUSTOMER")
  const assignedIds = customer.managerIds ?? []
  // Primary owner (accountability) first, then the rest of the team.
  const assigned = members
    .filter((m) => assignedIds.includes(m.id))
    .sort((a, b) => (a.id === ownerId ? -1 : b.id === ownerId ? 1 : 0))

  const setManagers = useMutation({
    mutationFn: (ids: string[]) => customersApi.update(customer.id, { managerIds: ids }),
    onSuccess: onChanged,
    onError: (e: Error) => notify.error(e.message || "Could not update managers"),
  })
  const toggle = (id: string) =>
    setManagers.mutate(assignedIds.includes(id) ? assignedIds.filter((x) => x !== id) : [...assignedIds, id])

  return (
    <Panel>
      <div className="mb-2.5 flex items-center justify-between">
        <p className={PANEL_HEAD}>
          <Users className="h-3.5 w-3.5" /> {t("customers.managers", "Managers")}
        </p>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={SMALL_PILL}>
                <UserPlus className="h-3.5 w-3.5" /> {t("customers.assign", "Assign")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-60 overflow-y-auto">
              <DropdownMenuLabel>{t("customers.assignManagers", "Assign managers")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {membersQ.isLoading ? (
                <div className="p-2">
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : members.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t("customers.noMembers", "No members")}
                </p>
              ) : (
                members.map((m) => {
                  const on = assignedIds.includes(m.id)
                  return (
                    <DropdownMenuItem
                      key={m.id}
                      onSelect={(e) => {
                        e.preventDefault()
                        toggle(m.id)
                      }}
                      className="gap-2"
                    >
                      <Avatar m={m} />
                      <span className="min-w-0 flex-1 truncate">{personName(m)}</span>
                      {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </DropdownMenuItem>
                  )
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("customers.unassigned", "Unassigned — no manager is working this customer yet.")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assigned.map((m) => (
            <span
              key={m.id}
              className={cn(
                "group inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 " +
                  "pr-2 text-xs font-medium",
                m.id === ownerId
                  ? "border-primary/30 bg-primary/5 text-foreground"
                  : "border-border bg-background text-foreground",
              )}
            >
              <Avatar m={m} />
              <span className="max-w-[9rem] truncate">{personName(m)}</span>
              {m.id === ownerId && (
                <span title={t("customers.primaryOwner", "Primary owner")}>
                  <Star className="h-3 w-3 fill-primary text-primary" />
                </span>
              )}
              {canEdit && (
                <button
                  onClick={() => toggle(m.id)}
                  title={t("common.remove", "Remove")}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </Panel>
  )
}

function Avatar({ m }: { m: AssignablePerson }) {
  if (m.avatarUrl)
    return (
      <img
        src={m.avatarUrl}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        decoding="async"
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    )
  return (
    <span
      className={
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full " +
        "bg-primary/10 text-[10px] font-semibold text-primary"
      }
    >
      {personInitials(m)}
    </span>
  )
}
