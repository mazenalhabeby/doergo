"use client"

import Link from "next/link"
import { Building2, CheckCircle2, Loader2, PauseCircle, ChevronRight } from "lucide-react";

import { type CompanyLocation } from "@/lib/api";
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuditTrail } from "@/components/common/audit-trail"
import { DangerZone } from "./danger-zone"
import { useGeneralTab } from "./use-general-tab";
import { GeneralTabOwnershipSection } from "./general-tab-ownership-section"
import { GeneralTabLocationSection } from "./general-tab-location-section"
import { GeneralTabTypeSection } from "./general-tab-type-section"
import { GeneralTabDefault } from "./general-tab-default"

export function GeneralTab({ space }: { space: CompanyLocation }) {
  const vm = useGeneralTab({ space })
  const {
    t,
    name,
    setName,
    mutation,
    handleSave,
    contentLinks,
  } = vm

  return (
    <div className="max-w-3xl space-y-5">
      {contentLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {contentLinks.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={`${href}?space=${space.id}`}
              className={"inline-flex items-center gap-2 rounded-lg border border-border bg-card " +
                "px-3 py-2 text-sm font-medium text-foreground transition-colors " +
                "hover:bg-muted/60"}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {/*
        Which workspace catches work that belongs to no particular one.

        The flag was set when the first space was created and could never move,
        so an organization whose first space turned out to be the wrong one was
        stuck — and the Danger zone refused to delete it with "make another
        space the default first", which nothing in the product could do.

        Here rather than in the Danger zone: choosing where unassigned work
        lands is an ordinary setting. It is the REFUSAL to delete that is
        dangerous, and that message now points at this card.
      */}
      <GeneralTabDefault vm={vm} space={space} />

      {/* ── Space details ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-[18px] w-[18px]" />
            </span>
            <div>
              <CardTitle className="text-base">{t("locations.detailsSection")}</CardTitle>
              <CardDescription>{t("locations.detailsHint")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-name">{t("locations.name")}</Label>
            <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("locations.name")} />
          </div>
          {/* Read-only status — archiving/restoring is done in the Danger zone below. */}
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{t("locations.activeLabel")}</p>
                {space.isActive ? (
                  <Badge
                    className={"gap-1 border-transparent bg-green-100 text-green-700 hover:bg-green-100 " +
                      "dark:bg-green-950 dark:text-green-300"}>
                    <CheckCircle2 className="h-3 w-3" />
                    {t("common.active")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-muted-foreground">
                    <PauseCircle className="h-3 w-3" />
                    {t("locations.archived", "Archived")}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t("locations.activeHint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Space type ── */}
      <GeneralTabTypeSection vm={vm} />

      {/* ── Ownership (project / my company / customer company) ── */}
      <GeneralTabOwnershipSection vm={vm} space={space} />

      {/* ── Location & timezone ── */}
      <GeneralTabLocationSection vm={vm} />

      {/* ── Save ── */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending} className="min-w-[120px]">
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            t("common.save")
          )}
        </Button>
      </div>

      {/* Full accountability audit trail — managers only (self-gated). */}
      <AuditTrail resourceType="locations" resourceId={space.id} />

      {/* Danger zone — delete (archive) this space. */}
      <DangerZone space={space} />
    </div>
  )
}
