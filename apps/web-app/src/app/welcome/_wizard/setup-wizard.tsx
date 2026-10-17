"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, PenLine, ArrowRight } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AREAS,
  INDUSTRY_CARDS,
  classifyWork,
  planFromIndustry,
  toolsFromModules,
  type WorkPlan,
} from "@/lib/setup"
import { buildOrg, type BuildStep } from "@/lib/setup/build"
import { WizardShell } from "./wizard-shell"
import { ChoiceCard } from "./choice-card"
import { WizardIcon } from "./wizard-icons"
import { useSetupWizard, BUILD_STEPS } from "./use-setup-wizard"
import {
  Hero,
  Kicker,
  ChipLabel,
  Chip,
  Divider,
  BuildRow,
  DoneRow,
  iconForArea,
} from "./setup-wizard-helpers"
import { SetupWizardGroup } from "./setup-wizard-group"

/**
 * Guided org-builder for a brand-new admin. Collects a plan through 3 tap-first
 * questions, then builds the real org (industry, modules, spaces) via the setup
 * engine. `onFinish` hands control back to the onboarding flow.
 */
export function SetupWizard({ onFinish }: { onFinish: () => void }) {
  const vm = useSetupWizard({ onFinish })
  const {
    t,
    user,
    step,
    text,
    plan,
    fromText,
    setFromText,
    spaceNames,
    teamSize,
    revealed,
    buildStatus,
    setAttempt,
    areaName,
    toolName,
    industryName,
    go,
    onType,
    confirmText,
    tapIndustry,
    confirmDerivedAreas,
    pickGroup,
    pickTeam,
    onSkip,
    showChrome,
    canBack,
    tools,
    firstName,
  } = vm

  return (
    <WizardShell
      step={step}
      total={3}
      showChrome={showChrome}
      canBack={canBack}
      onBack={() => go(Math.max(0, step - 1))}
      onSkip={onSkip}
    >
      {/* 0 — splash */}
      {step === 0 && (
        <div className="text-center">
          <Hero icon="sparkles" />
          <h1 className="mb-2 text-[28px] font-extrabold tracking-tight">
            {t("setup.splash.title", { name: firstName })}
          </h1>
          <p className="mx-auto mb-7 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
            {t("setup.splash.sub", { org: user?.organizationName || t("setup.yourCompany") })}
          </p>
          <Button size="lg" className="h-12 gap-2 px-8 text-base" onClick={() => go(1)}>
            {t("setup.splash.cta")} <ArrowRight className="size-4" />
          </Button>
          <p className="mt-6 text-[13px] text-muted-foreground">{t("setup.splash.reassure")}</p>
        </div>
      )}

      {/* 1 — what do you do */}
      {step === 1 && (
        <div className="text-center">
          <Kicker icon="sparkles" text={t("setup.work.kicker")} />
          <h1 className="mb-2 text-[28px] font-extrabold tracking-tight">{t("setup.work.title")}</h1>
          <p className="mx-auto mb-6 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
            {t("setup.work.sub")}
          </p>
          <div className="mx-auto max-w-[560px]">
            <div className="relative">
              <PenLine className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={text}
                onChange={(e) => onType(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmText()}
                placeholder={t("setup.work.placeholder")}
                className="h-[54px] rounded-xl pl-11 text-base shadow-sm"
              />
            </div>

            {/* live understanding */}
            {plan && text.trim().length >= 3 && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-1 rounded-xl border border-green-200 border-l-4 border-l-green-600 bg-card p-5 text-left shadow-md">
                <div className="mb-3 inline-flex items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-wide text-green-700">
                  <WizardIcon name="sparkles" className="size-3.5" /> {t("setup.work.understoodEyebrow")}
                </div>
                <div className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight">
                  <span className="grid size-9 place-items-center rounded-[10px] bg-green-50 text-green-600">
                    <WizardIcon name={plan.industryIcon} className="size-[19px]" />
                  </span>
                  <span>{t("setup.work.youreIn", { industry: industryName(plan.industryKey, plan.industryLabel) })}</span>
                </div>
                <p className="mb-1 mt-1.5 text-[13px] text-muted-foreground">{t("setup.work.understoodSub")}</p>

                <ChipLabel text={t("setup.work.areasLabel")} />
                <div className="flex flex-wrap gap-2">
                  {plan.areas.map((a) => (
                    <Chip key={a} icon={iconForArea(a)} label={areaName(a)} />
                  ))}
                </div>

                <ChipLabel text={t("setup.work.toolsLabel")} />
                <div className="flex flex-wrap gap-2">
                  {tools.map((tl) => (
                    <Chip key={tl.key} icon={tl.icon} label={toolName(tl.key)} muted />
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4">
                  <Button className="gap-2" onClick={() => go(2)}>
                    {t("setup.work.continue")} <ArrowRight className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground"
                    onClick={() => document.querySelector<HTMLInputElement>("input")?.focus()}
                  >
                    <PenLine className="size-4" /> {t("setup.work.addDetail")}
                  </Button>
                </div>
              </div>
            )}

            <Divider text={t("setup.work.orPick")} />
            <div className="grid grid-cols-3 gap-3">
              {INDUSTRY_CARDS.map((ind) => (
                <ChoiceCard
                  key={ind.key}
                  icon={ind.icon}
                  label={industryName(ind.key, ind.label)}
                  selected={!fromText && plan?.industryKey === ind.key}
                  onClick={() => tapIndustry(ind.key)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2 — areas / grouping */}
      <SetupWizardGroup vm={vm} />

      {/* 3 — team */}
      {step === 3 && (
        <div className="text-center">
          <Kicker icon="users" text={t("setup.team.kicker")} />
          <h1 className="mb-2 text-[28px] font-extrabold tracking-tight">{t("setup.team.title")}</h1>
          <p className="mx-auto mb-6 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
            {t("setup.team.sub")}
          </p>
          <div className="mx-auto grid max-w-[600px] grid-cols-3 gap-3">
            <ChoiceCard icon="user" label={t("setup.team.justMe")} hint={t("setup.team.justMeHint")} selected={teamSize === 0} onClick={() => pickTeam(0)} />
            <ChoiceCard icon="users" label={t("setup.team.small")} hint={t("setup.team.smallHint")} selected={teamSize === 1} onClick={() => pickTeam(1)} />
            <ChoiceCard icon="building" label={t("setup.team.big")} hint={t("setup.team.bigHint")} selected={teamSize === 2} onClick={() => pickTeam(2)} />
          </div>
        </div>
      )}

      {/* 4 — building */}
      {step === 4 && (
        <div className="text-center">
          <Hero icon="settings" />
          <h1 className="mb-2 text-[28px] font-extrabold tracking-tight">{t("setup.build.title")}</h1>
          <p className="mx-auto mb-7 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
            {buildStatus === "error" ? t("setup.build.error") : t("setup.build.sub")}
          </p>
          {buildStatus === "error" ? (
            <Button size="lg" className="gap-2" onClick={() => setAttempt((a) => a + 1)}>
              <Loader2 className="size-4" /> {t("setup.build.retry")}
            </Button>
          ) : (
            <div className="mx-auto max-w-[440px] text-left">
              {BUILD_STEPS.map((s, i) => (
                <BuildRow key={s} label={t(`setup.build.steps.${s}`)} done={i < revealed} active={i <= revealed} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5 — done */}
      {step === 5 && plan && (
        <div className="text-center">
          <Hero icon="checkCircle" green />
          <h1 className="mb-3 text-[28px] font-extrabold tracking-tight">{t("setup.done.title")}</h1>
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-green-100 bg-green-50 px-4 py-1.5 text-[13px] font-semibold text-green-700">
            <WizardIcon name="check" className="size-[15px]" />
            {t("setup.done.flag", { org: user?.organizationName || t("setup.yourCompany") })}
          </div>
          <div className="mx-auto mb-5 max-w-[500px] space-y-2.5 text-left">
            <DoneRow icon="folder" title={t("setup.done.areasTitle")} detail={spaceNames.join(", ")} />
            <DoneRow icon="wrench" title={t("setup.done.toolsTitle")} detail={tools.map((tl) => toolName(tl.key)).join(" · ")} />
            <DoneRow
              icon="mail"
              title={teamSize && teamSize > 0 ? t("setup.done.teamTitle") : t("setup.done.teamSoloTitle")}
              detail={teamSize && teamSize > 0 ? t("setup.done.teamReady") : t("setup.done.teamSolo")}
            />
          </div>
          <Button size="lg" className="h-12 gap-2 px-8 text-base" onClick={onFinish}>
            {t("setup.done.cta")} <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </WizardShell>
  )
}
