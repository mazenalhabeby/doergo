"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Shield, Pencil, Trash2, Loader2, Lock, ArrowLeft } from "lucide-react"

import { notify } from "@/lib/toast"
import { organizationsApi, type AccessRole } from "@/lib/api"
import { ACCESS_PERMISSION_SCHEMA } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const DEFAULT_ROLE_COLOR = "#2563eb"

// Org-scoped permission keys only (space-only keys are configured on the space).
const ORG_PERMISSIONS = ACCESS_PERMISSION_SCHEMA.filter((p) => p.scopes.includes("org"))

type Draft = { name: string; description: string; color: string; permissions: Record<string, boolean> }

/**
 * Manage the org's assignable roles (Admin, Manager, + custom). Built-in roles
 * are editable (permissions/name/color) but not deletable; custom roles are full
 * CRUD. A role grants its permission set org-wide to every member who holds it.
 */
export function ManageRolesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AccessRole | "new" | null>(null)

  const { data: roles, isLoading } = useQuery({
    queryKey: ["orgAccessRoles"],
    queryFn: () => organizationsApi.getRoles(),
    enabled: open,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => organizationsApi.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgAccessRoles"] })
      notify.success(t("roles.deleted", "Role deleted"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const close = () => { setEditing(null); onOpenChange(false) }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close() }}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
        {editing ? (
          <RoleEditor
            role={editing === "new" ? null : editing}
            onBack={() => setEditing(null)}
            onSaved={() => setEditing(null)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("roles.title", "Roles")}</DialogTitle>
              <DialogDescription>
                {t("roles.subtitle", "A role grants a set of permissions org-wide to every member who holds it.")}
              </DialogDescription>
            </DialogHeader>

            <div className="min-w-0 space-y-2 py-2">
              {isLoading ? (
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
              ) : (
                (roles || []).map((role) => {
                  const grants = ORG_PERMISSIONS.filter((p) => role.permissions?.[p.key])
                  const summary = grants.length
                    ? t("roles.permissionCount", "{{count}} permissions", { count: grants.length })
                    : t("roles.noPermissions", "No permissions")
                  return (
                    <div key={role.id} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: `${role.color || DEFAULT_ROLE_COLOR}20` }}>
                          <Shield className="h-4 w-4" style={{ color: role.color || DEFAULT_ROLE_COLOR }} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-sm font-semibold text-foreground truncate">{role.name}</span>
                            {role.isSystem && (
                              <Badge variant="outline" className="shrink-0 text-[11px] gap-1">
                                <Lock className="h-3 w-3" />{t("roles.builtIn", "Built-in")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate" title={grants.map((p) => p.label).join(" · ")}>
                            {summary}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(role)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!role.isSystem && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-600"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(role.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close}>{t("common.close", "Close")}</Button>
              <Button className="gap-1.5" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" />{t("roles.new", "New role")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RoleEditor({ role, onBack, onSaved }: { role: AccessRole | null; onBack: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!role

  const [draft, setDraft] = useState<Draft>(() => ({
    name: role?.name || "",
    description: "",
    color: role?.color || DEFAULT_ROLE_COLOR,
    permissions: { ...(role?.permissions || {}) },
  }))

  const grouped = useMemo(() => {
    const g: Record<string, typeof ORG_PERMISSIONS> = {}
    for (const p of ORG_PERMISSIONS) (g[p.domain] ||= []).push(p)
    return g
  }, [])

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { name: draft.name.trim(), description: draft.description.trim() || undefined, color: draft.color, permissions: draft.permissions }
      return isEdit ? organizationsApi.updateRole(role!.id, payload) : organizationsApi.createRole(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgAccessRoles"] })
      notify.success(isEdit ? t("roles.updated", "Role updated") : t("roles.created", "Role created"))
      onSaved()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const toggle = (key: string) =>
    setDraft((d) => ({ ...d, permissions: { ...d.permissions, [key]: !d.permissions[key] } }))

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <DialogTitle>{isEdit ? t("roles.edit", "Edit role") : t("roles.new", "New role")}</DialogTitle>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>{t("roles.name", "Name")}</Label>
          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Dispatcher" />
        </div>
        <div className="space-y-2">
          <Label>{t("roles.color", "Color")}</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={draft.color} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
              className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent" />
            <span className="text-xs text-muted-foreground">{draft.color}</span>
          </div>
        </div>

        <div className="space-y-3">
          <Label>{t("roles.permissions", "Permissions")}</Label>
          {Object.entries(grouped).map(([domain, perms]) => (
            <div key={domain} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`roles.domains.${domain}`, domain)}
              </p>
              {perms.map((p) => (
                <label key={p.key} className="flex items-start gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                  <Checkbox checked={draft.permissions[p.key] === true} onCheckedChange={() => toggle(p.key)} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={mutation.isPending}>{t("common.cancel")}</Button>
        <Button onClick={() => { if (!draft.name.trim()) return notify.error(t("roles.nameRequired", "Name is required")); mutation.mutate() }} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? t("common.save") : t("common.create")}
        </Button>
      </DialogFooter>
    </>
  )
}
