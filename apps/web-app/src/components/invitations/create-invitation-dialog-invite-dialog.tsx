"use client"

import { Mail, Link2 } from "lucide-react";
import { type CompanyLocation, type AccessRole } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScheduleFields } from "@/components/people/schedule-fields"
import { Segmented } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PermissionBuilder } from "./create-invitation-dialog-helpers"
import type { CreateInvitationDialogState } from "./use-create-invitation-dialog"
import { InviteAccessSection } from "./invite-access-section"
import { InvitePositionField } from "./invite-position-field"

/** Part of CreateInvitationDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function CreateInvitationDialogInviteDialog({ vm }: { vm: CreateInvitationDialogState }) {
  const {
    t,
    setMode,
    mode,
    email,
    setEmail,
    setIsExternal,
    setScheduleType,
    setAccess,
    isExternal,
    scheduleType,
    scheduleRows,
    setScheduleRows,
    monthlyHourBudget,
    setMonthlyHourBudget,
    locations,
    spaceId,
    setSpaceId,
    hasSpace,
    externalMode,
    setExternalMode,
    spaceRoles,
    externalChoice,
    setExternalChoice,
    builderModules,
    access,
    patchAccess,
    externalRoleId,
    setExternalRoleId,
  } = vm
  return (
    <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
      {/* Method toggle */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{t("invitations.inviteDialog.methodLabel")}</Label>
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-lg">
          <button
            type="button"
            onClick={() => setMode("email")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all",
              mode === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Mail className="h-4 w-4" />{t("invitations.inviteDialog.emailLabel")}
          </button>
          <button
            type="button"
            onClick={() => setMode("code")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all",
              mode === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Link2 className="h-4 w-4" />{t("invitations.inviteDialog.codeLabel")}
          </button>
        </div>
      </div>

      {/* Email (email mode only) */}
      {mode === "email" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t("invitations.inviteDialog.emailLabel")}</Label>
          <Input
            type="email"
            placeholder={t("invitations.inviteDialog.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9"
          />
        </div>
      )}

      <InvitePositionField vm={vm} />

      {/* Staff, or somebody else's */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("members.invite.whoSection")}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: false, label: t("members.invite.staffOption"), hint: t("members.invite.staffOptionHint") },
            { value: true, label: t("members.invite.externalOption"), hint: t("members.invite.externalOptionHint") },
          ] as const).map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => {
                setIsExternal(opt.value)
                // Schedule is the one control that disappears for an
                // external member, so its value is cleared with it — what
                // the form stops showing, it stops sending. Access is NOT
                // touched: the panel is identical for both, so the
                // selections in it must be too.
                if (opt.value) {
                  setScheduleType("NONE")
                  /*
                    What the form stops showing, it stops sending.

                    The four hidden sections still hold whatever was set
                    before the switch, and an invitation carrying an org
                    role or remote clock-in for an external member would be
                    refused — or worse, quietly applied. Their space is a
                    single assignment, so the scope is 'own' by definition.
                  */
                  setAccess((cur) => ({
                    ...cur,
                    memberRoleId: null,
                    allowRemote: false,
                    spaceScope: "own",
                  }))
                }
              }}
              aria-pressed={isExternal === opt.value}
              className={`rounded-lg border p-2.5 text-left transition-colors ${
                isExternal === opt.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-muted/40 hover:bg-muted"
              }`}
            >
              <span className="block text-xs font-medium text-foreground">{opt.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Schedule — same control as the Edit dialog (type + weekly hours /
          budget). Not for an external member: a schedule is the hours WE
          expect somebody to work, and this person's hours are their own
          employer's business. They come to approve ours, not to file
          theirs — they never clock in, so a rota line for them would sit
          permanently unmet and start raising no-shows against a company
          that owes us no attendance. */}
      {!isExternal && (
        <ScheduleFields
          scheduleType={scheduleType}
          onScheduleTypeChange={setScheduleType}
          scheduleRows={scheduleRows}
          onScheduleRowsChange={setScheduleRows}
          monthlyHourBudget={monthlyHourBudget}
          onMonthlyHourBudgetChange={setMonthlyHourBudget}
        />
      )}

      {/* Space (optional) */}
      {locations.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("invitations.inviteDialog.spaceLabel")}{" "}
            {isExternal ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-muted-foreground/50">{t("invitations.inviteDialog.optional")}</span>
            )}
          </Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className="h-9"><SelectValue placeholder={t("invitations.inviteDialog.spacePlaceholder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("invitations.inviteDialog.noSpace")}</SelectItem>
              {locations.map((loc: CompanyLocation) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Under the field it is about, and only while it is unmet — this
              is the one thing standing between the admin and a disabled
              Send button, so it has to say so where they are looking. */}
          {isExternal && !hasSpace && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {t("members.invite.externalNeedsSpace")}
            </p>
          )}
        </div>
      )}

      {/*
        What an outsider may do — only meaningful for an external invite, and
        only once the workspace is chosen (the builder greys out what that
        workspace does not run). Two ways: set it area by area, or use an
        existing shared role.
      */}
      {isExternal && hasSpace && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <Segmented
            ariaLabel={t("invitations.inviteDialog.externalRoleLabel", "Role in this workspace")}
            value={externalMode}
            onChange={setExternalMode}
            options={[
              { value: "builder", label: t("permissionBuilder.invite.custom") },
              ...(spaceRoles.length > 0 ? [{ value: "role" as const, label: t("permissionBuilder.invite.useRole") }] : []),
            ]}
          />
          {externalMode === "builder" ? (
            <PermissionBuilder
              name={email.trim() || t("permissionBuilder.invite.name")}
              isExternal
              value={externalChoice}
              onChange={setExternalChoice}
              spaceModules={builderModules}
              platform={{ value: access.platforms, onChange: (platforms) => patchAccess({ platforms }) }}
            />
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("invitations.inviteDialog.externalRoleLabel", "Role in this workspace")}
              </Label>
              <Select value={externalRoleId} onValueChange={setExternalRoleId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    {t("invitations.inviteDialog.externalRoleDefault", "Default (External Supervisor)")}
                  </SelectItem>
                  {spaceRoles.map((r: AccessRole) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "invitations.inviteDialog.externalRoleHint",
                  "An external member's access is this role, in this workspace only.",
                )}
              </p>
            </div>
          )}
        </div>
      )}

      <InviteAccessSection vm={vm} />
    </div>
  )
}
