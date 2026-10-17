"use client"

import { Plus, Shield, ShieldCheck, Loader2, Wrench, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatMoney, MONEY_LOCALE } from "@/lib/money"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmTargetDialog } from "@/components/confirm-dialog"
import { SectionHeader, EmptyState } from "./section-header"
import { RoleDialog } from "./space-role-dialog"
import { useSubRolesSection } from "./use-sub-roles-section"

/** The workspace's roles: work roles with their day rate here, management roles — moved here unchanged. */
// ── Section (a): roles in this workspace ─────────────────────────────────────
//
// Two lists, because they are two different things. WORK roles are trades —
// they carry how the work is billed and a day rate HERE, and grant nothing.
// MANAGEMENT roles carry permissions. Each card says who holds it here, so
// "who is a Mechanic at BILLA" is answered on the card rather than by reading
// down the member list.

export const formatMoneyCents = (cents: number, currency: string) => formatMoney(cents, currency, MONEY_LOCALE)

export function SubRolesSection({ spaceId }: { spaceId: string }) {
  const {
    money,
    t,
    dialog,
    setDialog,
    deleteTarget,
    setDeleteTarget,
    roles,
    isLoading,
    showUnused,
    setShowUnused,
    workRoles,
    notHere,
    picking,
    setPicking,
    duplicates,
    combine,
    useHere,
    unused,
    mgmtRoles,
    removeMutation,
    list,
  } = useSubRolesSection({ spaceId })

  /*
    ONE "New role" button. The two section buttons opened the same dialog with
    a different kind pre-selected — and the dialog asks the kind anyway.
  */
  return (
    <div className="space-y-6">
      {/* ONE way in: pick a company role for this workspace, or create a new one — in the same dialog. */}
      <div className="flex justify-end">
        <Button onClick={() => setPicking(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("scheduling.workRoles.addHere")}
        </Button>
      </div>
      <div className="space-y-3">
        <SectionHeader
          icon={Wrench}
          accent="blue"
          title={t("scheduling.workRoles.workHeading")}
          description={t("scheduling.workRoles.workIntro")}
        />
        {duplicates.map((g) => (
          <div
            key={g[0].id}
            className={"flex flex-wrap items-center justify-between gap-3 rounded-xl border " +
              "border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 " +
              "dark:text-amber-300"}
          >
            <span>{t("scheduling.workRoles.duplicateNotice", { count: g.length, name: g[0].name })}</span>
            <Button size="sm" variant="outline" disabled={combine.isPending} onClick={() => combine.mutate(g)}>
              {combine.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("scheduling.workRoles.combine")}
            </Button>
          </div>
        ))}
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : workRoles.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={t("scheduling.workRoles.noneHere")}
            description={t("scheduling.workRoles.noneHereHint")}
          />
        ) : (
          list(workRoles)
        )}
      </div>

      <div className="space-y-3">
        <SectionHeader
          icon={ShieldCheck}
          accent="violet"
          title={t("scheduling.workRoles.managementHeading")}
          description={t("scheduling.workRoles.managementIntro")}
        />
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : mgmtRoles.length === 0 ? (
          <EmptyState
            icon={Shield}
            title={t("scheduling.roles.empty.title")}
            description={t("scheduling.roles.empty.description")}
          />
        ) : (
          list(mgmtRoles)
        )}
        {unused.length > 0 && (
          <button
            type="button"
            onClick={() => setShowUnused((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showUnused
              ? t("scheduling.membersPage.hideUnused")
              : t("scheduling.membersPage.showUnused", {
                  count: unused.length,
                  names: unused.map((r) => r.name).join(", "),
                })}
          </button>
        )}
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("scheduling.workRoles.addHere")}</DialogTitle>
            <DialogDescription>{t("scheduling.workRoles.addHereIntro")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("scheduling.workRoles.companyRoles")}</p>
            {notHere.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t("scheduling.workRoles.allUsedHere")}</p>
            ) : (
              notHere.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    {r.dayRateCents != null && (
                      <span className="block text-xs text-muted-foreground">
                        {t("scheduling.workRoles.rateHere", {
                          rate: `${formatMoneyCents(r.dayRateCents, money.bill)} ${t("rates.perDay")}`,
                        })}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={useHere.isPending}
                      onClick={() => useHere.mutate(r.id)}
                    >
                      {t("scheduling.workRoles.useHere")}
                    </Button>
                    {/* Held by nobody, anywhere: it can go for good. */}
                    {r.inUseCount === 0 && !r.isSystem && !duplicates.some((g) => g.some((x) => x.id === r.id)) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        aria-label={t("common.delete")}
                        title={t("scheduling.workRoles.deleteUnused")}
                        onClick={() => {
                          setPicking(false)
                          setDeleteTarget(r)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setPicking(false)
                setDialog({ role: null, kind: "WORK" })
              }}
            >
              <Plus className="h-4 w-4" />
              {t("scheduling.workRoles.createNew")}
            </Button>
            <Button variant="ghost" onClick={() => setPicking(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialog && (
        <RoleDialog
          spaceId={spaceId}
          allRoles={roles ?? []}
          // The LIVE role from the list, not the snapshot taken when it opened —
          // or a day rate changed inside the dialog shows its old figure until a reload.
          role={dialog.role ? ((roles ?? []).find((r) => r.id === dialog.role!.id) ?? dialog.role) : null}
          defaultKind={dialog.kind}
          open
          onOpenChange={(o) => {
            if (!o) setDialog(null)
          }}
        />
      )}

      <ConfirmTargetDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("scheduling.roles.deleteTitle")}
        description={t("scheduling.roles.deleteConfirm", { name: deleteTarget?.name })}
        confirmLabel={t("common.delete")}
        mutation={removeMutation}
      />
    </div>
  )
}
