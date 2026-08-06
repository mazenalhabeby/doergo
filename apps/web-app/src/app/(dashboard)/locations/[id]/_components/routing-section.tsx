"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, MessageCircle, Save, Loader2, Shield } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, organizationsApi, type AccessRole } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionHeader } from "./section-header"

/**
 * Per-space routing config (Phase 3/4c): which space roles are (a) NOTIFIED about
 * members here and (b) CONTACTABLE by members here. Empty = the space's leader
 * roles by default. Self-contained: fetches the space + space roles and saves on
 * its own, independent of the General form.
 */
export function RoutingSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: space, isLoading: spaceLoading } = useQuery({
    queryKey: ["location", spaceId],
    queryFn: () => locationsApi.getById(spaceId),
  })
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["orgAccessRoles", "space"],
    queryFn: () => organizationsApi.getRoles("space"),
    staleTime: 60000,
  })

  const [notifyIds, setNotifyIds] = useState<string[]>([])
  const [contactIds, setContactIds] = useState<string[]>([])
  useEffect(() => {
    if (space) {
      setNotifyIds((space as any).notifyRoleIds || [])
      setContactIds((space as any).contactRoleIds || [])
    }
  }, [space])

  const saveMutation = useMutation({
    mutationFn: () => locationsApi.update(spaceId, { notifyRoleIds: notifyIds, contactRoleIds: contactIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location", spaceId] })
      notify.success(t("scheduling.routing.saved", "Routing updated"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const dirty =
    space != null &&
    (JSON.stringify([...notifyIds].sort()) !== JSON.stringify([...(((space as any).notifyRoleIds) || [])].sort()) ||
      JSON.stringify([...contactIds].sort()) !== JSON.stringify([...(((space as any).contactRoleIds) || [])].sort()))

  const isLoading = spaceLoading || rolesLoading

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Bell}
        accent="amber"
        title={t("scheduling.routing.heading", "Notifications & contact")}
        description={t("scheduling.routing.intro", "Choose which space roles are notified about members here, and which roles members here can contact. Empty = the space's leaders.")}
        action={
          <Button size="sm" className="gap-1.5" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t("common.save")}
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (roles || []).length === 0 ? (
        <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t("scheduling.routing.noRoles", "No space roles defined yet.")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <RolePicker
            icon={Bell}
            title={t("scheduling.routing.notifyTitle", "Notified about members here")}
            roles={roles || []}
            selected={notifyIds}
            onToggle={(id) => toggle(notifyIds, setNotifyIds, id)}
            emptyHint={t("scheduling.routing.notifyEmpty", "Default: the space's leaders")}
          />
          <RolePicker
            icon={MessageCircle}
            title={t("scheduling.routing.contactTitle", "Contactable by members here")}
            roles={roles || []}
            selected={contactIds}
            onToggle={(id) => toggle(contactIds, setContactIds, id)}
            emptyHint={t("scheduling.routing.contactEmpty", "Default: the space's leaders")}
          />
        </div>
      )}
    </div>
  )
}

function RolePicker({
  icon: Icon,
  title,
  roles,
  selected,
  onToggle,
  emptyHint,
}: {
  icon: typeof Bell
  title: string
  roles: AccessRole[]
  selected: string[]
  onToggle: (id: string) => void
  emptyHint: string
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <div className="divide-y divide-border/40">
        {roles.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors">
            <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => onToggle(r.id)} />
            <span className="h-6 w-6 rounded-md shrink-0 flex items-center justify-center" style={{ backgroundColor: `${r.color || "#6b7280"}20` }}>
              <Shield className="h-3 w-3" style={{ color: r.color || "#6b7280" }} />
            </span>
            <span className="text-sm text-foreground">{r.name}</span>
          </label>
        ))}
      </div>
      <p className="px-4 py-2 text-[11px] text-muted-foreground">{selected.length === 0 ? emptyHint : ""}</p>
    </div>
  )
}
