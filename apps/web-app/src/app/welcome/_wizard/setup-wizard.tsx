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

type Grouping = "byType" | "byPlace" | "byTeam" | "pickForMe"
const BUILD_STEPS: BuildStep[] = ["company", "spaces", "tools", "finish"]

/**
 * Guided org-builder for a brand-new admin. Collects a plan through 3 tap-first
 * questions, then builds the real org (industry, modules, spaces) via the setup
 * engine. `onFinish` hands control back to the onboarding flow.
 */
export function SetupWizard({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()

  const [step, setStep] = useState(0)
  const [text, setText] = useState("")
  const [plan, setPlan] = useState<WorkPlan | null>(null)
  const [fromText, setFromText] = useState(false)
  const [spaceNames, setSpaceNames] = useState<string[]>([])
  const [teamSize, setTeamSize] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [buildStatus, setBuildStatus] = useState<"running" | "ok" | "error">("running")
  const [attempt, setAttempt] = useState(0)
  const [skipping, setSkipping] = useState(false)

  // ---- i18n resolvers (labels come from the `setup` namespace) ----
  const areaName = useCallback((key: string) => t(`setup.areaNames.${key}`), [t])
  const toolName = useCallback((key: string) => t(`setup.tools.${key}`), [t])
  const industryName = useCallback(
    (key: string, fallback: string) => t(`setup.industries.${key}`, { defaultValue: fallback }),
    [t],
  )

  const go = useCallback((n: number) => setStep(n), [])

  // ---- Q1: free text ----
  const onType = (v: string) => {
    setText(v)
    setFromText(true)
    setPlan(v.trim().length >= 3 ? classifyWork(v) : null)
  }
  const confirmText = () => {
    if (!plan) return
    go(2)
  }
  const tapIndustry = (key: string) => {
    const ind = INDUSTRY_CARDS.find((i) => i.key === key)
    if (!ind) return
    setPlan(planFromIndustry(ind))
    setFromText(false)
    setText("")
    go(2)
  }

  // ---- Q2: areas / grouping ----
  const goTeamWith = (names: string[]) => {
    setSpaceNames(names)
    go(3)
  }
  const confirmDerivedAreas = () => {
    if (!plan) return
    goTeamWith(plan.areas.map(areaName))
  }
  const pickGroup = (kind: Grouping) => {
    if (!plan) return
    if (kind === "byPlace") {
      goTeamWith([t("setup.seeds.mainOffice"), t("setup.seeds.north"), t("setup.seeds.south")])
    } else if (kind === "byTeam") {
      goTeamWith([t("setup.seeds.fieldTeam"), t("setup.seeds.office")])
    } else {
      goTeamWith(plan.areas.map(areaName))
    }
  }

  // ---- Q3: team ----
  const pickTeam = (i: number) => {
    setTeamSize(i)
    go(4)
  }

  // ---- build (runs once per attempt when entering step 4) ----
  // The real work (which creates spaces) is fired immediately; the checklist is
  // revealed one row at a time on a fixed cadence so the animation always plays
  // in full, even when the API resolves quickly. We only advance to "done" once
  // BOTH the animation and the real build have finished successfully.
  useEffect(() => {
    if (step !== 4) return
    if (!plan) {
      setBuildStatus("error")
      return
    }
    let cancelled = false
    const timers: number[] = []
    setBuildStatus("running")
    setRevealed(0)

    const work = buildOrg({
      industryLabel: plan.industryLabel,
      moduleKeys: plan.moduleKeys,
      spaceNames,
    })
      .then(() => refreshUser().catch(() => undefined))
      .then(() => true)
      .catch(() => false)

    const total = BUILD_STEPS.length
    const STAGGER = 850
    const START = 650
    for (let i = 1; i <= total; i++) {
      timers.push(window.setTimeout(() => !cancelled && setRevealed(i), START + STAGGER * (i - 1)))
    }
    timers.push(
      window.setTimeout(
        () => {
          void work.then((ok) => {
            if (cancelled) return
            if (ok) {
              setBuildStatus("ok")
              timers.push(window.setTimeout(() => !cancelled && go(5), 550))
            } else {
              setBuildStatus("error")
            }
          })
        },
        START + STAGGER * (total - 1) + 250,
      ),
    )

    return () => {
      cancelled = true
      timers.forEach((tm) => window.clearTimeout(tm))
    }
    // plan/spaceNames are fixed by the time we reach step 4; re-run only on retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, attempt])

  // ---- Skip: still create one space so the app isn't left empty ----
  const onSkip = async () => {
    if (skipping) return
    setSkipping(true)
    try {
      await locationsApi.create({ name: t("setup.defaultSpace") })
    } catch {
      /* non-fatal — the gate will route them back to try again */
    } finally {
      onFinish()
    }
  }

  const showChrome = step >= 1 && step <= 3
  const canBack = step > 1 && step <= 3

  // ---- derived display data ----
  const tools = useMemo(() => (plan ? toolsFromModules(plan.moduleKeys) : []), [plan])
  const firstName = user?.firstName || t("setup.friend")

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
      {step === 2 && plan && (
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
      )}

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

/* ---------------- small presentational helpers ---------------- */

function Hero({ icon, green }: { icon: string; green?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto mb-[18px] grid size-[72px] place-items-center rounded-[20px] text-white",
        green
          ? "bg-gradient-to-br from-green-600 to-green-500 shadow-[0_12px_28px_rgba(22,163,74,.28)]"
          : "bg-gradient-to-br from-primary to-blue-500 shadow-[0_12px_28px_rgba(37,99,235,.30)]",
      )}
    >
      <WizardIcon name={icon} className="size-[34px]" />
    </div>
  )
}

function Kicker({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-[12px] font-bold tracking-wide text-primary">
      <WizardIcon name={icon} className="size-3.5" /> {text}
    </span>
  )
}

function ChipLabel({ text }: { text: string }) {
  return <div className="mb-2.5 mt-4 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{text}</div>
}

function Chip({ icon, label, muted }: { icon: string; label: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-[7px] text-[13px] font-semibold",
        muted ? "border-border bg-slate-50 text-muted-foreground" : "border-primary/15 bg-primary/5 text-primary",
      )}
    >
      <WizardIcon name={icon} className="size-[15px]" /> {label}
    </span>
  )
}

function Divider({ text }: { text: string }) {
  return (
    <div className="relative mx-auto my-5 max-w-[520px] text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
      <span className="relative z-10 bg-card px-3">{text}</span>
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-border" />
    </div>
  )
}

function BuildRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div
      className={cn(
        "mb-2.5 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm transition-opacity duration-300",
        active ? "opacity-100" : "opacity-40",
      )}
    >
      {done ? (
        <span className="grid size-[26px] place-items-center rounded-full bg-green-600 text-white">
          <WizardIcon name="check" className="size-[15px]" />
        </span>
      ) : (
        <Loader2 className="size-[26px] animate-spin text-primary" />
      )}
      <span className="text-[14.5px] font-semibold">{label}</span>
    </div>
  )
}

function DoneRow({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary/5 text-primary">
        <WizardIcon name={icon} className="size-[19px]" />
      </span>
      <div>
        <div className="text-[14.5px] font-bold">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{detail}</div>
      </div>
    </div>
  )
}

/* ---------------- pure helpers ---------------- */

function iconForArea(key: string): string {
  return AREAS[key]?.icon ?? "clipboard"
}
