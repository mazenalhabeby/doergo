"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import { INDUSTRY_CARDS, classifyWork, planFromIndustry, toolsFromModules, type WorkPlan } from "@/lib/setup"
import { buildOrg, type BuildStep } from "@/lib/setup/build"

export type Grouping = "byType" | "byPlace" | "byTeam" | "pickForMe"

export const BUILD_STEPS: BuildStep[] = ["company", "spaces", "tools", "finish"]

/** SetupWizard's state and handlers — everything before its markup, moved here unchanged. */
export function useSetupWizard({ onFinish }: Pick<{ onFinish: () => void }, 'onFinish'>) {
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

  return {
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
  }
}

/** What SetupWizard and its sections read. */
export type SetupWizardState = ReturnType<typeof useSetupWizard>
