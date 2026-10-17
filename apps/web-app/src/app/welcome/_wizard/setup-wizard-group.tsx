"use client"

import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChoiceCard } from "./choice-card"
import { WizardIcon } from "./wizard-icons"
import { Kicker, Divider, iconForArea } from "./setup-wizard-helpers"
import type { SetupWizardState } from "./use-setup-wizard"

/** Part of SetupWizard's markup, moved here unchanged; it reads the page's state from `vm`. */
export function SetupWizardGroup({ vm }: { vm: SetupWizardState }) {
  const {
    step,
    plan,
    t,
    fromText,
    areaName,
    confirmDerivedAreas,
    setFromText,
    industryName,
    pickGroup,
  } = vm
  return (
    <>{step === 2 && plan && (
      <div className="text-center">
        <Kicker icon="folder" text={t("setup.group.kicker")} />
        {fromText ? (
          <>
            <h1 className="mb-2 text-[28px] font-extrabold tracking-tight">{t("setup.group.confirmTitle")}</h1>
            <p className="mx-auto mb-6 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
              {t("setup.group.confirmSub")}
            </p>
            <div className="mx-auto grid max-w-[600px] grid-cols-3 gap-3">
              {plan.areas.map((a) => (
                <ChoiceCard key={a} as="static" icon={iconForArea(a)} label={areaName(a)} />
              ))}
            </div>
            <div className="mt-7">
              <Button size="lg" className="h-12 gap-2 px-8" onClick={confirmDerivedAreas}>
                {t("setup.group.looksGood")} <ArrowRight className="size-4" />
              </Button>
            </div>
            <Button variant="ghost" className="mt-2.5 text-muted-foreground" onClick={() => setFromText(false)}>
              {t("setup.group.groupDifferently")}
            </Button>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-[28px] font-extrabold tracking-tight">{t("setup.group.chooseTitle")}</h1>
            <p className="mx-auto mb-6 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
              {t("setup.group.chooseSub", { industry: industryName(plan.industryKey, plan.industryLabel).toLowerCase() })}
            </p>
            <div className="mx-auto max-w-[600px]">
              {/* Recommended path — a full-width hero, not a badge stuck on a grid card */}
              <button
                type="button"
                onClick={() => pickGroup("pickForMe")}
                className="group flex w-full items-center gap-4 rounded-2xl border-[1.5px] border-primary/25 bg-gradient-to-br from-primary/[0.07] via-card to-card p-4 text-left shadow-sm ring-1 ring-inset ring-primary/5 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <WizardIcon name="wand" className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[15.5px] font-bold tracking-tight">{t("setup.group.pickForMe")}</span>
                    <span className="rounded-full bg-primary px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wide text-primary-foreground">
                      {t("setup.badges.recommended")}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{t("setup.group.pickForMeHint")}</span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
              </button>

              <Divider text={t("setup.group.orManual")} />

              <div className="grid grid-cols-3 gap-3">
                <ChoiceCard icon="grid" label={t("setup.group.byType")} hint={t("setup.group.byTypeHint")} onClick={() => pickGroup("byType")} />
                <ChoiceCard icon="mapPin" label={t("setup.group.byPlace")} hint={t("setup.group.byPlaceHint")} onClick={() => pickGroup("byPlace")} />
                <ChoiceCard icon="users" label={t("setup.group.byTeam")} hint={t("setup.group.byTeamHint")} onClick={() => pickGroup("byTeam")} />
              </div>
            </div>
          </>
        )}
      </div>
    )}</>
  )
}
