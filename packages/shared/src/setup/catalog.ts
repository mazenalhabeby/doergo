/**
 * Setup-wizard catalog — the SINGLE SOURCE OF TRUTH for the guided org builder.
 *
 * Framework-agnostic data only (no React, no API). The UI maps `icon` keys to
 * platform icon components; the build step maps `modulePreset` to real feature
 * modules. Reuses the shared `MODULE_PRESETS` so we never duplicate the module
 * catalog.
 */
import { MODULE_PRESETS } from '../types'

/** A group the wizard can create (becomes a Space). `key` → i18n + icon. */
export interface AreaMeta {
  key: string
  icon: string
}

/** An industry the wizard understands. */
export interface IndustryMeta {
  key: string
  /** Canonical English label — stored on `organization.industry`. */
  label: string
  /** Icon key (see wizard-icons). */
  icon: string
  /** Which shared MODULE_PRESET drives the enabled feature modules. */
  modulePreset: string
  /** Seed areas when the user taps this industry (no free-text). */
  seedAreas: string[]
  /** Lower-cased keywords used to classify free text. */
  keywords: string[]
}

/** Area metadata: key → icon (labels come from i18n `setup.areas.<key>`). */
export const AREAS: Record<string, AreaMeta> = {
  installations: { key: "installations", icon: "package" },
  maintenance: { key: "maintenance", icon: "refresh" },
  repairs: { key: "repairs", icon: "wrench" },
  preventive: { key: "preventive", icon: "refresh" },
  breakdowns: { key: "breakdowns", icon: "alert" },
  inspections: { key: "inspections", icon: "search" },
  requests: { key: "requests", icon: "inbox" },
  regularCleans: { key: "regularCleans", icon: "refresh" },
  deepCleans: { key: "deepCleans", icon: "spray" },
  oneOff: { key: "oneOff", icon: "sparkles" },
  cleaning: { key: "cleaning", icon: "spray" },
  patrols: { key: "patrols", icon: "shield" },
  alarmCallouts: { key: "alarmCallouts", icon: "alert" },
  staticGuarding: { key: "staticGuarding", icon: "door" },
  regularVisits: { key: "regularVisits", icon: "refresh" },
  projects: { key: "projects", icon: "ruler" },
  snagging: { key: "snagging", icon: "wrench" },
  callbacks: { key: "callbacks", icon: "refresh" },
  installs: { key: "installs", icon: "package" },
  supportTickets: { key: "supportTickets", icon: "ticket" },
  servicing: { key: "servicing", icon: "refresh" },
  callouts: { key: "callouts", icon: "alert" },
  routes: { key: "routes", icon: "mapPin" },
  pickups: { key: "pickups", icon: "package" },
  deliveries: { key: "deliveries", icon: "truck" },
  treatments: { key: "treatments", icon: "spray" },
  followUps: { key: "followUps", icon: "refresh" },
  grounds: { key: "grounds", icon: "trees" },
  jobs: { key: "jobs", icon: "clipboard" },
}

/** Ordered so the "tap a starting point" grid reads well (9 shown, rest match-only). */
export const INDUSTRIES: IndustryMeta[] = [
  { key: "repairs", label: "Repairs & trades", icon: "wrench", modulePreset: "field_service",
    seedAreas: ["installations", "maintenance", "repairs"],
    keywords: ["hvac", "air condition", "aircon", " ac ", "heat", "cool", "plumb", "electric", "boiler", "furnace", "refriger", "gas", "pipe", "wiring", "appliance", "trade"] },
  { key: "machines", label: "Machines & maintenance", icon: "factory", modulePreset: "field_service",
    seedAreas: ["preventive", "breakdowns", "inspections"],
    keywords: ["machine", "industr", "factory", "plant", "equipment", "mechanic", "cnc", "production", "elevator", "lift", "conveyor"] },
  { key: "facilities", label: "Buildings & facilities", icon: "building", modulePreset: "field_service",
    seedAreas: ["requests", "maintenance", "inspections"],
    keywords: ["facilit", "building", "property", "tenant", "caretaker", "real estate", "office manage"] },
  { key: "cleaning", label: "Cleaning", icon: "spray", modulePreset: "field_service",
    seedAreas: ["regularCleans", "deepCleans", "oneOff"],
    keywords: ["clean", "janitor", "housekeep", "pool", "carpet", "window clean", "sanit", "disinfect", "laundry"] },
  { key: "security", label: "Security & guarding", icon: "shield", modulePreset: "field_service",
    seedAreas: ["patrols", "alarmCallouts", "staticGuarding"],
    keywords: ["security", "guard", "patrol", "surveil", "alarm", "cctv", "doorman"] },
  { key: "grounds", label: "Gardens & grounds", icon: "trees", modulePreset: "field_service",
    seedAreas: ["regularVisits", "projects"],
    keywords: ["landscap", "garden", "lawn", "grounds", "tree", "irrigation", "mow", "hedge"] },
  { key: "construction", label: "Construction", icon: "hardHat", modulePreset: "project",
    seedAreas: ["projects", "snagging", "callbacks"],
    keywords: ["construct", "builder", "contractor", "renov", "carpen", "roof", "paint", "concrete", "scaffold"] },
  { key: "it", label: "IT & telecom", icon: "server", modulePreset: "field_service",
    seedAreas: ["installs", "supportTickets", "maintenance"],
    keywords: ["network", "telecom", "fiber", "fibre", "cabl", "server", "computer", "antenna", "router", "tech support"] },
  { key: "solar", label: "Solar & energy", icon: "sun", modulePreset: "field_service",
    seedAreas: ["installations", "servicing", "callouts"],
    keywords: ["solar", "photovolt", " pv ", "renewable", "panel", "ev charg", "heat pump", "battery"] },
  { key: "logistics", label: "Delivery & logistics", icon: "truck", modulePreset: "logistics",
    seedAreas: ["routes", "pickups", "deliveries"],
    keywords: ["deliver", "logistic", "courier", "transport", "fleet", "haul", "route"] },
  { key: "pest", label: "Pest control", icon: "bug", modulePreset: "field_service",
    seedAreas: ["treatments", "inspections", "followUps"],
    keywords: ["pest", "exterminat", "rodent", "insect", "fumigat", "termite"] },
]

/** Fallback when nothing matches — a flexible starter. */
export const FALLBACK_INDUSTRY: IndustryMeta = {
  key: "other", label: "General", icon: "grid", modulePreset: "field_service",
  seedAreas: ["jobs", "maintenance"], keywords: [],
}

/** The nine industries shown as tap-cards (the rest are match-only). */
export const INDUSTRY_CARDS = INDUSTRIES.slice(0, 9)

/** Free-text activity → area rules (verb/keyword regex → area key). Order = priority. */
export const ACTIVITY_RULES: { re: RegExp; area: string }[] = [
  { re: /instal|fit|mount|set ?up|new build|deploy/, area: "installations" },
  { re: /repair|fix|broke|fault|breakdown|emergenc|callout|call out|urgent|24 ?7/, area: "repairs" },
  { re: /maintain|maintenance|servic|preventive|annual|regular|check ?up/, area: "maintenance" },
  { re: /inspect|survey|audit|assess|test/, area: "inspections" },
  { re: /clean|wash|janitor|housekeep/, area: "cleaning" },
  { re: /patrol|guard|surveil/, area: "patrols" },
  { re: /deliver|courier|transport|haul|route|pick ?up/, area: "deliveries" },
  { re: /renov|project|construct|build ?out/, area: "projects" },
  { re: /garden|landscap|lawn|grounds|mow/, area: "grounds" },
]

/** Modules enabled for an industry (deduped, from the shared preset). */
export function modulesForIndustry(industry: IndustryMeta): string[] {
  const preset = MODULE_PRESETS.find((p) => p.key === industry.modulePreset)
  return preset ? [...preset.modules] : []
}

/**
 * Friendly "tools" projection of a module set — a curated, non-overwhelming
 * headline list for the summary card. Always maps 1:1 to real enabled modules.
 */
export interface ToolConcept { key: string; icon: string }
export function toolsFromModules(moduleKeys: string[]): ToolConcept[] {
  const has = (k: string) => moduleKeys.includes(k)
  const out: ToolConcept[] = [{ key: "jobs", icon: "clipboard" }]
  if (has("service_reports")) out.push({ key: "serviceReports", icon: "folder" })
  if (has("attachments")) out.push({ key: "photos", icon: "package" })
  if (has("tracking")) out.push({ key: "tracking", icon: "mapPin" })
  if (has("time_tracking")) out.push({ key: "clock", icon: "refresh" })
  if (has("checklists")) out.push({ key: "checklists", icon: "check" })
  if (has("sprints") || has("phases")) out.push({ key: "projects", icon: "ruler" })
  return out
}
