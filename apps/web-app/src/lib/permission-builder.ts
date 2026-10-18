import {
  EXTERNAL_ALLOWED_PERMISSIONS,
  OBSERVER_SEAT_MONTHLY_CENTS,
  PERMISSION_AREAS,
  PERMISSION_KEYS,
  PERMISSION_SWITCHES,
  SEAT_MONTHLY_CENTS,
  choiceOfPreset,
  isObserverSeat,
  permissionsFromChoice,
  presetOfPermissions,
  switchAvailable,
  type PermissionArea,
  type PermissionChoice,
  type PermissionPresetId,
  type PermissionSet,
  type PermissionSwitch,
} from "@hbcfield/shared/client"

/**
 * The permission builder's rules as the SCREEN applies them — pure, so the
 * component and its tests read the same answers.
 *
 * Nothing here decides what a person may hold: the model is
 * `packages/shared/src/access/permission-levels.ts` and the server validates
 * every save (external allow-list, the caller's own ceiling). This only decides
 * what is worth OFFERING — an external member is never shown a level the
 * server would refuse, and an area whose module the workspace does not run is
 * greyed out with the reason instead of offered and silently granting nothing.
 */

const EXTERNAL_ALLOWED = new Set<string>(EXTERNAL_ALLOWED_PERMISSIONS)

/** The order presets are offered in. */
export const PRESET_ORDER: readonly PermissionPresetId[] = ["observer", "supervisor", "manager"]

/**
 * An area as one person may be given it: its levels cut at the first one that
 * carries a key they may not hold (levels are cumulative, so nothing above it
 * could be held either). `null` when nothing beyond "none" is left.
 */
function areaFor(area: PermissionArea, isExternal: boolean): PermissionArea | null {
  if (!isExternal) return area
  const levels = []
  for (const level of area.levels) {
    if (!level.adds.every((k) => EXTERNAL_ALLOWED.has(k))) break
    levels.push(level)
  }
  return levels.length > 1 ? { ...area, levels } : null
}

/** The areas offered to this person, in the model's order. */
export function builderAreas(isExternal: boolean): PermissionArea[] {
  return PERMISSION_AREAS.map((a) => areaFor(a, isExternal)).filter((a): a is PermissionArea => a !== null)
}

/** The switches offered to this person. Things never offered to externals are simply absent. */
export function builderSwitches(isExternal: boolean): PermissionSwitch[] {
  return PERMISSION_SWITCHES.filter((s) => !isExternal || EXTERNAL_ALLOWED.has(s.key))
}

/**
 * Is this area switched off because the workspace does not run its module?
 * `spaceModules` undefined = not known yet, so nothing is greyed out on a guess.
 */
export function areaModuleMissing(area: PermissionArea, spaceModules: readonly string[] | null | undefined): boolean {
  return !!area.module && !!spaceModules && !spaceModules.includes(area.module)
}

/**
 * A preset, fitted to this person and this workspace: every level clamped to
 * the highest one they may be offered, an area whose module is missing left at
 * "none", and a switch they may not hold left off. Saving a preset therefore
 * never sends something the server would refuse or the workspace cannot use.
 */
export function presetChoice(
  id: PermissionPresetId,
  opts: { isExternal: boolean; spaceModules?: readonly string[] | null },
): PermissionChoice {
  const base = choiceOfPreset(id)
  const levels = { ...base.levels }
  for (const area of PERMISSION_AREAS) {
    const offered = areaFor(area, opts.isExternal)
    if (!offered || areaModuleMissing(area, opts.spaceModules)) {
      levels[area.id] = "none"
      continue
    }
    const ids = offered.levels.map((l) => l.id)
    if (!ids.includes(levels[area.id] ?? "none")) levels[area.id] = ids[ids.length - 1]!
  }
  const allowed = new Set(builderSwitches(opts.isExternal).map((s) => s.id))
  const switches = { ...base.switches }
  for (const sw of PERMISSION_SWITCHES) if (!allowed.has(sw.id)) switches[sw.id] = false
  return { levels, switches, extra: [] }
}

/** The keys a choice grants, as a sorted list (what the seat price reads). */
function heldKeys(perms: PermissionSet): string[] {
  return PERMISSION_KEYS.filter((k) => perms[k] === true)
}

/** Which preset the choice is exactly, or null for a custom set. */
export function presetOfChoice(choice: PermissionChoice): PermissionPresetId | null {
  return presetOfPermissions(permissionsFromChoice(choice))
}

/** Is this switch's value meaningful at the current levels? */
export function switchOn(choice: PermissionChoice, sw: PermissionSwitch): boolean {
  return choice.switches[sw.id] === true && switchAvailable(sw, choice.levels)
}

/**
 * The seat this person costs, read from what they would HOLD — never from a
 * preset's name (billing/seats.ts). Only an external member can be the reduced
 * seat; for everybody else the price is not this screen's business.
 */
export function seatFor(choice: PermissionChoice, isExternal: boolean): { kind: "observer" | "full"; cents: number } | null {
  if (!isExternal) return null
  const observer = isObserverSeat({ isExternal }, heldKeys(permissionsFromChoice(choice)))
  return observer
    ? { kind: "observer", cents: OBSERVER_SEAT_MONTHLY_CENTS }
    : { kind: "full", cents: SEAT_MONTHLY_CENTS }
}

/**
 * The choice with every area the workspace cannot use set to "none" — what an
 * invitation sends, so a preset picked before the workspace was chosen never
 * carries keys for a module that workspace does not run.
 */
export function withoutMissingModules(choice: PermissionChoice, spaceModules: readonly string[] | null | undefined): PermissionChoice {
  const levels = { ...choice.levels }
  for (const area of PERMISSION_AREAS) if (areaModuleMissing(area, spaceModules)) levels[area.id] = "none"
  return { ...choice, levels }
}

/** Two permission sets grant the same keys. */
export function samePermissions(a: PermissionSet | null | undefined, b: PermissionSet | null | undefined): boolean {
  return heldKeys(a ?? {}).join(",") === heldKeys(b ?? {}).join(",")
}
