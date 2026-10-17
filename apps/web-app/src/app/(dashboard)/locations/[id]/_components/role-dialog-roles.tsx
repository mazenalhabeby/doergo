"use client"

import { RoleDialogRates } from "./role-dialog-rates"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Segmented } from "./work-roles"
import { SPACE_PERMISSIONS } from "./use-role-dialog"
import { SPACE_PERMISSION_DOMAINS } from "./role-dialog-helpers"
import type { RoleDialogState } from "./use-role-dialog"
import type { RoleDialog } from "./space-role-dialog"

/** Part of RoleDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function RoleDialogRoles({
  vm,
  role,
  spaceId,
  onOpenChange,
}: {
  vm: RoleDialogState
  role: Parameters<typeof RoleDialog>[0]["role"]
  spaceId: Parameters<typeof RoleDialog>[0]["spaceId"]
  onOpenChange: Parameters<typeof RoleDialog>[0]["onOpenChange"]
}) {
  const {
    isEdit,
    t,
    isWork,
    name,
    setName,
    clash,
    useExisting,
    kind,
    setKind,
    kindLocked,
    initialDayRate,
    setInitialDayRate,
    description,
    setDescription,
    color,
    setColor,
    permissions,
    togglePerm,
    mergeTargets,
    mergeInto,
    setMergeInto,
    setConfirmMerge,
    confirmMerge,
    merge,
    mutation,
    handleSave,
  } = vm
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEdit ? t("scheduling.roles.editTitle") : t("scheduling.roles.new")}</DialogTitle>
        <DialogDescription>
          {isWork ? t("scheduling.workRoles.workIntro") : t("scheduling.roles.dialogDescription")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="role-name">{t("scheduling.roles.fields.name")}</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("scheduling.roles.namePlaceholder")}
          />
          {clash && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <span>{t("scheduling.workRoles.nameExists", { name: clash.name })}</span>
              {clash.kind === "WORK" && clash.activeHere === false && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={useExisting.isPending}
                  onClick={() => useExisting.mutate(clash.id)}
                >
                  {t("scheduling.workRoles.useNamedHere", { name: clash.name })}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t("scheduling.workRoles.kind")}</Label>
          <div>
            <Segmented
              ariaLabel={t("scheduling.workRoles.kind")}
              value={kind}
              onChange={setKind}
              disabled={kindLocked}
              options={[
                { value: "WORK", label: t("scheduling.workRoles.kindWork") },
                { value: "MANAGEMENT", label: t("scheduling.workRoles.kindManagement") },
              ]}
            />
          </div>
          {kindLocked && (
            <p className="text-xs text-muted-foreground">
              {role!.isSystem
                ? t("scheduling.workRoles.kindBuiltIn")
                : t("scheduling.workRoles.kindLocked", { count: role!.inUseCount })}
            </p>
          )}
        </div>

        {isWork && !isEdit && (
          <div className="space-y-2">
            <Label htmlFor="role-day-rate">{t("scheduling.workRoles.initialDayRate")}</Label>
            <div className="relative max-w-[12rem]">
              <Input
                id="role-day-rate"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={initialDayRate}
                onChange={(e) => setInitialDayRate(e.target.value)}
                className="pr-14 tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {t("scheduling.workRoles.perDay")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("scheduling.workRoles.dayRateHint")}</p>
          </div>
        )}

        {isWork && isEdit && <RoleDialogRates vm={vm} role={role} spaceId={spaceId} />}

        <div className="space-y-2">
          <Label htmlFor="role-desc">{t("scheduling.roles.fields.description")}</Label>
          <Textarea id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-color">{t("scheduling.roles.fields.color")}</Label>
          <div className="flex items-center gap-2">
            <input
              id="role-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent"
            />
            <span className="text-xs text-muted-foreground">{color}</span>
          </div>
        </div>

        {isWork ? (
          /* A trade grants nothing — said, not merely hidden. */
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("scheduling.workRoles.grantsNothing")}
          </p>
        ) : (
          <div className="space-y-2">
            <Label>{t("scheduling.roles.fields.permissions")}</Label>
            <div className="space-y-4">
              {SPACE_PERMISSION_DOMAINS.map((domain) => (
                <div key={domain}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(`roles.domains.${domain}`, domain)}
                  </p>
                  <div className="space-y-1.5">
                    {SPACE_PERMISSIONS.filter((p) => p.domain === domain).map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-start gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <Checkbox
                          checked={permissions[perm.key] === true}
                          onCheckedChange={() => togglePerm(perm.key)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          {/*
                            The catalogue's own label and description are the
                            fallback, so a newly added permission is readable
                            here the day it exists rather than rendering its key.
                          */}
                          <p className="text-sm font-medium text-foreground">
                            {t(`scheduling.roles.permissions.${perm.key}.label`, perm.label)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t(`scheduling.roles.permissions.${perm.key}.description`, perm.description)}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {mergeTargets.length > 0 && (
        <div className="space-y-2 rounded-xl border border-dashed p-3">
          <p className="text-xs font-medium text-foreground">{t("scheduling.workRoles.mergeTitle")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("scheduling.workRoles.mergeHint", { name: role!.name })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={mergeInto}
              onValueChange={(v) => {
                setMergeInto(v)
                setConfirmMerge(false)
              }}
            >
              <SelectTrigger className="h-8 w-56">
                <SelectValue placeholder={t("scheduling.workRoles.mergeChoose")} />
              </SelectTrigger>
              <SelectContent>
                {mergeTargets.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!confirmMerge ? (
              <Button size="sm" variant="outline" disabled={!mergeInto} onClick={() => setConfirmMerge(true)}>
                {t("scheduling.workRoles.mergeAction")}
              </Button>
            ) : (
              <Button size="sm" variant="destructive" disabled={merge.isPending} onClick={() => merge.mutate()}>
                {merge.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t("scheduling.workRoles.mergeConfirm", {
                  name: role!.name,
                  into: mergeTargets.find((r) => r.id === mergeInto)?.name ?? "",
                })}
              </Button>
            )}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? t("common.save") : t("common.create")}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
