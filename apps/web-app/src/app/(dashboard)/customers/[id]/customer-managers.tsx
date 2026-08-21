"use client"

import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { UserPlus, X, Check, Users, Star } from "lucide-react"

import { customersApi, organizationsApi, type Customer, type OrgMember } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

const memberInitials = (m: OrgMember) => `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`.toUpperCase() || "?"
const fullName = (m: OrgMember) => `${m.firstName} ${m.lastName}`.trim()

/** Assigned sales managers for a CRM customer. Hidden once the customer has app
 *  access (handled by the caller) — an app customer is self-serve. */
export function ManagersPanel({ customer, ownerId, onChanged }: { customer: Customer; ownerId?: string; onChanged: () => void }) {
  const { t } = useTranslation()
  const membersQ = useQuery({ queryKey: ["org-members-assignable"], queryFn: () => organizationsApi.getMembers({ limit: 100 }) })
  const members = (membersQ.data?.data ?? []).filter((m) => m.isActive && m.role !== "CUSTOMER")
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
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {t("customers.managers", "Managers")}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <UserPlus className="h-3.5 w-3.5" /> {t("customers.assign", "Assign")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 w-60 overflow-y-auto">
            <DropdownMenuLabel>{t("customers.assignManagers", "Assign managers")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {membersQ.isLoading ? (
              <div className="p-2"><Skeleton className="h-6 w-full" /></div>
            ) : members.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("customers.noMembers", "No members")}</p>
            ) : members.map((m) => {
              const on = assignedIds.includes(m.id)
              return (
                <DropdownMenuItem key={m.id} onSelect={(e) => { e.preventDefault(); toggle(m.id) }} className="gap-2">
                  <Avatar m={m} />
                  <span className="min-w-0 flex-1 truncate">{fullName(m)}</span>
                  {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("customers.unassigned", "Unassigned — no manager is working this customer yet.")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assigned.map((m) => (
            <span key={m.id} className={cn("group inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs font-medium",
              m.id === ownerId ? "border-primary/30 bg-primary/5 text-foreground" : "border-border bg-background text-foreground")}>
              <Avatar m={m} />
              <span className="max-w-[9rem] truncate">{fullName(m)}</span>
              {m.id === ownerId && <span title={t("customers.primaryOwner", "Primary owner")}><Star className="h-3 w-3 fill-primary text-primary" /></span>}
              <button onClick={() => toggle(m.id)} title={t("common.remove", "Remove")}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Avatar({ m }: { m: OrgMember }) {
  if (m.avatarUrl) return <img src={m.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{memberInitials(m)}</span>
}
