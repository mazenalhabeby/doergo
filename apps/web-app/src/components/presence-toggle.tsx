"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Check, ChevronDown } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { usersApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type Presence = "AVAILABLE" | "BUSY" | "AWAY"

const OPTS: { value: Presence; key: string; def: string; color: string }[] = [
  { value: "AVAILABLE", key: "presence.available", def: "Available", color: "bg-green-500" },
  { value: "BUSY", key: "presence.busy", def: "Busy", color: "bg-red-500" },
  { value: "AWAY", key: "presence.away", def: "Away", color: "bg-amber-500" },
]

/**
 * Self availability control (hybrid): a manual override of Available / Busy /
 * Away, or "Auto" (null) which falls back to the task/clock-derived status.
 * Shown for clock-eligible members, next to the clock widget.
 */
export function PresenceToggle() {
  const { user, refreshUser } = useAuth()
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)

  // Anyone can set their availability (it's what teammates see in the Management
  // strip / worker cards) — including admins/managers who don't clock in.
  if (!user) return null

  const current = (user.presence ?? null) as Presence | null
  const active = OPTS.find((o) => o.value === current)

  const set = async (presence: Presence | null) => {
    setSaving(true)
    try {
      await usersApi.updateMe({ presence })
      await refreshUser()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error", "Something went wrong"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" disabled={saving} title={t("presence.title", "Availability")}>
          <span className={cn("h-2 w-2 rounded-full", active ? active.color : "bg-muted-foreground/40")} />
          <span className="hidden text-xs font-medium sm:inline">{active ? t(active.key, active.def) : t("presence.auto", "Auto")}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("presence.title", "Availability")}</DropdownMenuLabel>
        {OPTS.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => set(o.value)} className="gap-2">
            <span className={cn("h-2 w-2 rounded-full", o.color)} />
            {t(o.key, o.def)}
            {current === o.value && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => set(null)} className="gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
          {t("presence.autoDesc", "Auto (from task)")}
          {current === null && <Check className="ml-auto h-3.5 w-3.5" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
