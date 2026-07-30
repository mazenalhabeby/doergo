/**
 * Pure work classifier — reads a free-text description and produces a setup plan
 * (industry + work areas + feature modules). Deterministic, instant, offline,
 * zero cost. The wizard's "smart understanding" without a network round-trip.
 *
 * Single responsibility: text → WorkPlan. No React, no side effects.
 */
import {
  ACTIVITY_RULES,
  FALLBACK_INDUSTRY,
  INDUSTRIES,
  modulesForIndustry,
  type IndustryMeta,
} from "./catalog"

export interface WorkPlan {
  /** Matched industry key (or "other"). */
  industryKey: string
  /** Canonical English industry label (stored on the org). */
  industryLabel: string
  /** Icon key for the industry. */
  industryIcon: string
  /** Ordered area keys — become Spaces (capped, deduped). */
  areas: string[]
  /** Real feature-module keys to enable (from the shared preset). */
  moduleKeys: string[]
}

const MAX_AREAS = 4

/** Normalize free text for matching: lowercase, strip punctuation, pad. */
function normalize(text: string): string {
  return " " + text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ") + " "
}

/** Pick the best-matching industry by keyword hit count (ties → first). */
export function matchIndustry(text: string): IndustryMeta {
  const v = normalize(text)
  let best: IndustryMeta | null = null
  let bestScore = 0
  for (const ind of INDUSTRIES) {
    let score = 0
    for (const kw of ind.keywords) if (v.includes(kw)) score++
    if (score > bestScore) {
      bestScore = score
      best = ind
    }
  }
  return best ?? FALLBACK_INDUSTRY
}

/** Derive work areas from the activities mentioned; fall back to industry seeds. */
function areasFromText(text: string, industry: IndustryMeta): string[] {
  const v = normalize(text)
  const found: string[] = []
  for (const rule of ACTIVITY_RULES) {
    if (rule.re.test(v) && !found.includes(rule.area)) found.push(rule.area)
  }
  const areas = found.slice(0, MAX_AREAS)
  return areas.length > 0 ? areas : industry.seedAreas
}

/** Classify a free-text description into a full setup plan. */
export function classifyWork(text: string): WorkPlan {
  const industry = matchIndustry(text)
  return {
    industryKey: industry.key,
    industryLabel: industry.label,
    industryIcon: industry.icon,
    areas: areasFromText(text, industry),
    moduleKeys: modulesForIndustry(industry),
  }
}

/** Build a plan directly from a tapped industry (no free text). */
export function planFromIndustry(industry: IndustryMeta): WorkPlan {
  return {
    industryKey: industry.key,
    industryLabel: industry.label,
    industryIcon: industry.icon,
    areas: industry.seedAreas,
    moduleKeys: modulesForIndustry(industry),
  }
}
