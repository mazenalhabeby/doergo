"use client"

import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { personInitials, personName, jobTitleOf } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DatedRateField } from "@/components/rates/dated-rate"
import { MemberRoutingEditor } from "./member-routing-editor"
import { MemberAutoClock } from "./member-auto-clock"
import { MemberPermissions } from "./member-permissions"
import { BILL_BY, Segmented } from "./work-roles"
import { NONE } from "./members-people-helpers"
import { CostFromProfile } from "./member-panel-helpers"
import type { MemberPanelState } from "./use-member-panel"
import type { MemberPanel } from "./member-panel"

/** Part of MemberPanel's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MemberPanelMembers({ vm, member, spaceId, isClient, autoClockRow, autoClockWorkspace, roster }: { vm: MemberPanelState; member: Parameters<typeof MemberPanel>[0]['member']; spaceId: Parameters<typeof MemberPanel>[0]['spaceId']; isClient: Parameters<typeof MemberPanel>[0]['isClient']; autoClockRow: Parameters<typeof MemberPanel>[0]['autoClockRow']; autoClockWorkspace: Parameters<typeof MemberPanel>[0]['autoClockWorkspace']; roster: Parameters<typeof MemberPanel>[0]['roster'] }) {
  const {
    t,
    builderReplacesPicker,
    section,
    heading,
    external,
    update,
    workOpen,
    workRoles,
    cents,
    allow,
    mgmtOpen,
    mgmtRoles,
    mayGrant,
    bill,
    billByLabel,
    money,
    rates,
    saveRate,
    workRole,
    canViewLabourCost,
    setConfirmRemove,
    confirmRemove,
    remove,
  } = vm
  return (
    <SheetContent className="w-full overflow-y-auto sm:max-w-md">
      {member && (
        <>
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {member.user?.avatarUrl && <AvatarImage src={member.user.avatarUrl} alt="" />}
                <AvatarFallback>{personInitials(member.user)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate">{member.user ? personName(member.user) : t("scheduling.members.unknownMember")}</span>
                <SheetDescription className="truncate text-xs">
                  {jobTitleOf({ position: member.user?.position, memberRole: member.spaceRole }) || t("scheduling.membersPage.inWorkspace")}
                </SheetDescription>
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            {/* An external member's whole authority is the builder below — no trade, no second role. */}
            {!builderReplacesPicker && (
            <section className={section}>
              <h3 className={heading}>{t("scheduling.membersPage.roles")}</h3>
              {!external && (
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm text-muted-foreground">{t("scheduling.workRoles.workRoleHere")}</Label>
                  <Select
                    value={member.workRole?.id ?? NONE}
                    onValueChange={(v) => update.mutate({ workRoleId: v === NONE ? null : v })}
                    disabled={!workOpen || update.isPending}
                  >
                    <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("scheduling.workRoles.noWorkRole")}</SelectItem>
                      {workRoles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                          {r.dayRateCents != null && <span className="ml-1.5 text-xs text-muted-foreground">· {cents(r.dayRateCents)} {t("rates.perDay")}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!external && (
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <Label htmlFor="allow-second" className="text-sm text-muted-foreground">{t("scheduling.workRoles.allowSecond")}</Label>
                    <span className="block text-[11px] text-muted-foreground">{t("scheduling.workRoles.allowSecondHint")}</span>
                  </span>
                  <Switch id="allow-second" checked={allow} onCheckedChange={(v) => update.mutate({ allowSecondRole: v })} disabled={update.isPending} />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm text-muted-foreground">{t("scheduling.workRoles.managementRoleHere")}</Label>
                <Select
                  value={member.spaceRole?.id ?? NONE}
                  onValueChange={(v) => update.mutate({ managementRoleId: v === NONE ? null : v })}
                  disabled={!mgmtOpen || update.isPending}
                >
                  <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("scheduling.workRoles.noManagementRole")}</SelectItem>
                    {mgmtRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!mgmtOpen && <p className="text-[11px] text-muted-foreground">{t("scheduling.membersPage.secondRoleOff")}</p>}
            </section>
            )}

            {mayGrant && (
              <MemberPermissions
                key={member.id}
                spaceId={spaceId}
                member={member}
                section={section}
                heading={heading}
                collapsible={!external}
              />
            )}

            {isClient && !external && (
              <section className={section}>
                <h3 className={heading}>{t("scheduling.membersPage.billing")}</h3>
                <Segmented
                  ariaLabel={t("scheduling.workRoles.billBy")}
                  value={bill}
                  onChange={(v) => update.mutate({ billBy: v })}
                  disabled={update.isPending}
                  options={BILL_BY.map((b) => ({ value: b, label: billByLabel(b) }))}
                />
                <p className="text-[11px] text-muted-foreground">{t("scheduling.workRoles.billByHint")}</p>
                {/*
                  Which of their hours the CLIENT is charged. Their own pay and
                  the margin's cost stay on counted time, whatever is chosen.
                */}
                {bill !== "DAY" && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs font-medium text-foreground">{t("scheduling.membersPage.hoursBasis")}</p>
                    <div role="radiogroup" aria-label={t("scheduling.membersPage.hoursBasis")} className="grid gap-1 rounded-xl border border-border bg-muted/50 p-1">
                      {(["COUNTED", "CLOCKED", "SHIFT"] as const).map((b) => {
                        const on = (member.effectiveHoursBasis ?? "COUNTED") === b
                        return (
                          <button
                            key={b}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={update.isPending}
                            onClick={() => !on && update.mutate({ hoursBasis: b })}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              on ? "bg-card shadow-sm" : "hover:bg-card/60",
                            )}
                          >
                            <span className="block text-xs font-semibold text-foreground">{t(`scheduling.membersPage.basis.${b}`)}</span>
                            <span className="block text-[11px] text-muted-foreground">{t(`scheduling.membersPage.basis.${b}Hint`)}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t("scheduling.membersPage.hoursBasisHint")}</p>
                  </div>
                )}
              </section>
            )}

            {isClient && !external && (
              <section className={section}>
                <h3 className={heading}>{t("scheduling.membersPage.rates")}</h3>
                {bill !== "DAY" && (
                  <DatedRateField
                    id={`panel-bill-${member.id}`}
                    label={t("rates.spaceBill")}
                    currency={money.bill}
                    currentCents={member.billRateCents ?? null}
                    emptyLabel={member.inheritedBillRateCents != null ? t("rates.usesDefault", { rate: cents(member.inheritedBillRateCents) }) : undefined}
                    history={rates?.filter((r) => r.kind === "BILL_HOUR")}
                    onSubmit={(c, from) => saveRate({ billRateCents: c }, from)}
                  />
                )}
                {bill !== "HOUR" && (
                  <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t("scheduling.workRoles.dayRate")}</span>
                    <span className="font-semibold tabular-nums">
                      {workRole?.dayRateCents != null
                        ? `${cents(workRole.dayRateCents)} ${t("rates.perDay")}`
                        : <span className="font-normal text-muted-foreground">{workRole ? t("scheduling.workRoles.dayRateNone") : t("scheduling.membersPage.needsWorkRole")}</span>}
                      {workRole && <span className="block text-right text-[11px] font-normal text-muted-foreground">{t("scheduling.membersPage.fromRole", { role: workRole.name })}</span>}
                    </span>
                  </div>
                )}
                {/*
                  ⚠️ WHAT THIS PERSON COSTS LIVES ON THEIR PROFILE, read-only
                  here. A second, per-workspace cost read the same on screen
                  and silently won; a client's day rate copied into it made
                  the margin zero (rate-ladder LEVELS_BY_KIND).
                */}
                {canViewLabourCost && (
                  <CostFromProfile
                    member={member}
                    bill={bill}
                    hourPrice={member.billRateCents ?? member.inheritedBillRateCents ?? null}
                    dayPrice={workRole?.dayRateCents ?? null}
                    priceCurrency={money.bill}
                    costCurrency={money.cost}
                  />
                )}
              </section>
            )}

            {/* Only while the workspace has the automatic clock on, and never for an external member. */}
            {autoClockRow !== undefined && (
              <MemberAutoClock spaceId={spaceId} row={autoClockRow ?? undefined} workspace={autoClockWorkspace} section={section} heading={heading} />
            )}

            <section className={section}>
              <h3 className={heading}>{t("scheduling.membersPage.notifications")}</h3>
              <MemberRoutingEditor spaceId={spaceId} member={member} roster={roster} stacked />
            </section>

            <section className={section}>
              <Button variant="ghost" className="gap-1.5 px-0 text-red-600 hover:bg-transparent hover:text-red-700" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="h-4 w-4" />
                {t("scheduling.membersPage.removeFromWorkspace")}
              </Button>
            </section>
          </div>

          <ConfirmDialog
            open={confirmRemove}
            onOpenChange={setConfirmRemove}
            title={t("scheduling.members.removeTitle", "Remove from workspace?")}
            description={t("scheduling.members.removeConfirm", { name: personName(member.user) })}
            confirmLabel={t("scheduling.members.remove", "Remove")}
            onConfirm={(e) => { e.preventDefault(); remove.mutate() }}
            destructive
            pending={remove.isPending}
          />
        </>
      )}
    </SheetContent>
  )
}
