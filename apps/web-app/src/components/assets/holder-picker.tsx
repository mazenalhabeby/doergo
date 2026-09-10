"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Ban, Check, Search, Smartphone, User, X } from "lucide-react"

import { customersApi, organizationsApi, type OrgMember } from "@/lib/api"
import { kindHolderLabel, type KindShape } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"

/**
 * Choosing who holds something.
 *
 * Extracted because it is now asked in two places — editing a record, and
 * handing one over — and a picker that enforces the kind's rules in one of them
 * and not the other is exactly how a single-holder van ends up with two drivers.
 *
 * Deliberately dumb: it renders a selection and reports changes. Whether that
 * selection is saved onto a record or turned into a custody period is the
 * caller's business.
 */

/*
  A holder is one string: "u:<userId>" or "c:<customerId>".

  One encoding for both sides keeps selection a set-membership test instead of
  two parallel lists that can disagree about who is chosen — and makes the
  single case a list of length one rather than a separate code path.
*/
export type HolderKey = string

export const memberName = (m: OrgMember) => `${m.firstName} ${m.lastName}`.trim()
export const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"

/** "u:x" / "c:x" → what the API takes. */
export const decodeHolders = (keys: HolderKey[]): Array<{ userId?: string; customerId?: string }> =>
  keys.map((h) => (h.startsWith("u:") ? { userId: h.slice(2) } : { customerId: h.slice(2) }))

export const encodeHolderList = (
  holders?: Array<{ userId?: string | null; customerId?: string | null }> | null,
): HolderKey[] =>
  (holders ?? [])
    .map((h) => (h.userId ? `u:${h.userId}` : h.customerId ? `c:${h.customerId}` : ""))
    .filter(Boolean)

export function HolderPicker({
  shape,
  spaceId,
  value,
  onChange,
  enabled = true,
  /** Shows the chosen people as removable chips. Off where a caller draws its own. */
  showChips,
}: {
  shape: KindShape
  spaceId?: string | null
  value: HolderKey[]
  onChange: (next: HolderKey[]) => void
  enabled?: boolean
  showChips?: boolean
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<"members" | "clients">(shape.holder.members ? "members" : "clients")
  const [q, setQ] = useState("")

  const membersQ = useQuery({
    queryKey: ["org-members-assignable"],
    queryFn: () => organizationsApi.getMembers({ limit: 100 }),
    enabled: enabled && shape.holder.enabled && shape.holder.members,
  })
  const members = (membersQ.data?.data ?? []).filter((m) => m.isActive && m.role !== "CUSTOMER")

  const clientsQ = useQuery({
    queryKey: ["space-clients", spaceId],
    queryFn: () => customersApi.list({ spaceId: spaceId ?? undefined, limit: 100 }),
    enabled: enabled && shape.holder.enabled && shape.holder.clients,
  })
  const clients = clientsQ.data?.data ?? []

  /*
    A kind that holds ONE replaces rather than adds. Enforced here as well as on
    the server: the server refusing is correct, but a picker that lets somebody
    tick two and then fails on save is a screen that lies about what it accepts.
  */
  const toggle = (key: HolderKey) => {
    if (!shape.holder.multiple) {
      onChange(value[0] === key ? [] : [key])
      return
    }
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key])
  }

  const list = (tab === "members"
    ? members.map((m) => ({ value: `u:${m.id}`, name: memberName(m), sub: t("assetRecords.memberTag", "Member (staff)") }))
    : clients.map((c) => ({ value: `c:${c.id}`, name: c.name, sub: t("assetRecords.client", "Client") }))
  ).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const loading = tab === "members" ? membersQ.isLoading : clientsQ.isLoading

  /*
    A chosen person's name, from whichever side of the picker they came.

    Looked up across BOTH lists rather than the open tab: a flat can hold a
    member and a client at once, and a chip that read "Unknown" whenever the
    other tab was showing would be a bug nobody could explain.
  */
  const nameOf = (key: HolderKey) => {
    if (key.startsWith("u:")) {
      const m = members.find((x) => x.id === key.slice(2))
      return m ? memberName(m) : t("assetRecords.formerMember", "Former member")
    }
    return clients.find((x) => x.id === key.slice(2))?.name ?? t("assetRecords.client", "Client")
  }

  return (
    <div className="space-y-1.5">
      {showChips && value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => toggle(h)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {nameOf(h)}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border">
        <div className="flex items-center gap-1 border-b border-border p-1">
          {shape.holder.members && (
            <TabBtn active={tab === "members"} onClick={() => { setTab("members"); setQ("") }}
              icon={User} label={t("assetRecords.members", "Members")} />
          )}
          {shape.holder.clients && (
            <TabBtn active={tab === "clients"} onClick={() => { setTab("clients"); setQ("") }}
              icon={Smartphone} label={t("assetRecords.clients", "Clients")} />
          )}
          <button
            type="button"
            onClick={() => onChange([])}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              value.length === 0 ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Ban className="h-3.5 w-3.5" /> {t("assetRecords.nobody", "Nobody")}
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("common.search", "Search…")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-52 overflow-y-auto p-1">
          {loading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {tab === "clients"
                ? t("assetRecords.noClients", "No clients in this workspace yet")
                : t("assetRecords.noMembers", "No members to choose from")}
            </p>
          ) : list.map((r) => {
            const sel = value.includes(r.value)
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => toggle(r.value)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                  sel ? "bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {initials(r.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{r.sub}</span>
                </span>
                {sel && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** The word this kind uses for whoever holds one — "Driver", "Resident". */
export function useHolderLabel(shape: KindShape) {
  const { t } = useTranslation()
  return kindHolderLabel(shape, t("assetRecords.holder", "Held by"))
}

function TabBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof User; label: string
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
