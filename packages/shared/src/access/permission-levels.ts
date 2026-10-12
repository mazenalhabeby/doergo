import {
  PERMISSION_KEYS,
  type AccessPermissionKey,
  type PermissionSet,
} from '../types/permissions';

/**
 * WHAT SOMEBODY MAY DO IN ONE WORKSPACE — as areas, levels and switches.
 *
 * Twenty-odd checkboxes is how a role gets granted "delete clients" without
 * "see clients". Here each AREA is a short ladder whose levels include
 * everything below them, and the abilities that are a separate trust — delete
 * a time entry, add people, give roles — are SWITCHES of their own.
 *
 * ONE definition, read by the web builder, the phone, the server's validation
 * and the tests (docs/plans/external-role-builder.md). Levels are a VIEW over a
 * PermissionSet, never a second store: `permissionsFromChoice` writes keys,
 * `choiceFromPermissions` reads them back, and a key no level covers survives
 * the round trip in `extra`, so editing a role here never silently drops a
 * grant somebody made elsewhere.
 */

export type PermissionAreaId = 'tasks' | 'attendance' | 'crm' | 'portal' | 'assets';
export type PermissionSwitchId =
  | 'overtime'
  | 'correctAttendance'
  | 'deleteAttendance'
  | 'rota'
  | 'tracking'
  | 'addPeople'
  | 'grantRoles';

export interface PermissionLevel {
  id: string;
  /** Keys THIS level adds; a level grants its own keys and every lower level's. */
  adds: readonly AccessPermissionKey[];
}

export interface PermissionArea {
  id: PermissionAreaId;
  /** Ordered lowest → highest; the first is always "none". */
  levels: readonly PermissionLevel[];
  /** The workspace module the area needs — the builder greys it out without it. */
  module?: string;
}

export interface PermissionSwitch {
  id: PermissionSwitchId;
  key: AccessPermissionKey;
  /** Meaningful only once this area is at or above this level (the builder disables it otherwise). */
  requires?: { area: PermissionAreaId; level: string };
}

export const PERMISSION_AREAS: readonly PermissionArea[] = [
  {
    id: 'tasks',
    levels: [
      { id: 'none', adds: [] },
      { id: 'view', adds: ['canViewAllTasks'] },
      { id: 'create', adds: ['canCreateTasks'] },
      { id: 'assign', adds: ['canAssignTasks'] },
    ],
  },
  {
    id: 'attendance',
    module: 'time_tracking',
    levels: [
      { id: 'none', adds: [] },
      { id: 'view', adds: ['canViewSpaceAttendance'] },
      { id: 'approve', adds: ['canApproveAttendance'] },
    ],
  },
  {
    id: 'crm',
    module: 'crm',
    levels: [
      { id: 'none', adds: [] },
      { id: 'view', adds: ['crmViewAll'] },
      { id: 'add', adds: ['crmCreateClients'] },
      { id: 'edit', adds: ['crmEditInfo', 'crmWork'] },
      { id: 'delete', adds: ['crmManageClients'] },
    ],
  },
  {
    id: 'portal',
    module: 'b2c_portal',
    levels: [
      { id: 'none', adds: [] },
      { id: 'view', adds: ['canViewPortal'] },
      { id: 'answer', adds: ['canAnswerPortal'] },
      { id: 'manage', adds: ['canManagePortals'] },
    ],
  },
  {
    id: 'assets',
    module: 'assets',
    levels: [
      { id: 'none', adds: [] },
      { id: 'view', adds: ['canViewAssets'] },
      { id: 'log', adds: ['canLogAssets'] },
      { id: 'manage', adds: ['canManageAssets'] },
    ],
  },
];

export const PERMISSION_SWITCHES: readonly PermissionSwitch[] = [
  { id: 'overtime', key: 'canApproveOvertime', requires: { area: 'attendance', level: 'view' } },
  { id: 'correctAttendance', key: 'canReconcileAttendance', requires: { area: 'attendance', level: 'view' } },
  { id: 'deleteAttendance', key: 'canDeleteAttendance', requires: { area: 'attendance', level: 'view' } },
  { id: 'rota', key: 'canManageRota', requires: { area: 'attendance', level: 'view' } },
  { id: 'tracking', key: 'canViewTracking' },
  { id: 'addPeople', key: 'canAddSpaceMembers' },
  { id: 'grantRoles', key: 'canGrantSpaceRoles' },
];

export interface PermissionChoice {
  levels: Record<PermissionAreaId, string>;
  switches: Record<PermissionSwitchId, boolean>;
  /** Granted keys no area or switch covers — carried through untouched. */
  extra: AccessPermissionKey[];
}

export type PermissionPresetId = 'observer' | 'supervisor' | 'manager';

/**
 * Starting points in the builder. The observer is exactly the €2 seat
 * (`OBSERVER_SEAT_PERMISSIONS`); every other preset is a full seat — the price
 * follows the keys, never the preset's name (billing/seats.ts).
 */
export const PERMISSION_PRESETS: Record<PermissionPresetId, { levels: Partial<Record<PermissionAreaId, string>>; switches: Partial<Record<PermissionSwitchId, boolean>> }> = {
  observer: { levels: { tasks: 'create' }, switches: {} },
  supervisor: { levels: { tasks: 'view', attendance: 'approve' }, switches: { overtime: true } },
  manager: {
    levels: { tasks: 'assign', attendance: 'approve', crm: 'edit', portal: 'answer', assets: 'log' },
    switches: { overtime: true, correctAttendance: true, rota: true, tracking: true, addPeople: true },
  },
};

const areaById = new Map(PERMISSION_AREAS.map((a) => [a.id, a]));

/** Every key a level grants: its own and every lower level's. */
export function keysOfLevel(areaId: PermissionAreaId, levelId: string): AccessPermissionKey[] {
  const area = areaById.get(areaId);
  if (!area) return [];
  const out: AccessPermissionKey[] = [];
  for (const level of area.levels) {
    out.push(...level.adds);
    if (level.id === levelId) return out;
  }
  return []; // an unknown level grants nothing — fail closed
}

/** Is `levelId` at or above `atLeast` in this area? */
export function levelReaches(areaId: PermissionAreaId, levelId: string, atLeast: string): boolean {
  const ids = areaById.get(areaId)?.levels.map((l) => l.id) ?? [];
  const at = ids.indexOf(levelId);
  const need = ids.indexOf(atLeast);
  return at >= 0 && need >= 0 && at >= need;
}

/** Is this switch usable at the current levels? */
export function switchAvailable(sw: PermissionSwitch, levels: Partial<Record<PermissionAreaId, string>>): boolean {
  if (!sw.requires) return true;
  return levelReaches(sw.requires.area, levels[sw.requires.area] ?? 'none', sw.requires.level);
}

/** A choice → the PermissionSet it grants. A switch whose area is too low grants nothing. */
export function permissionsFromChoice(choice: Partial<PermissionChoice>): PermissionSet {
  const out: PermissionSet = {};
  const levels = choice.levels ?? ({} as Partial<Record<PermissionAreaId, string>>);
  for (const area of PERMISSION_AREAS) {
    for (const key of keysOfLevel(area.id, levels[area.id] ?? 'none')) out[key] = true;
  }
  for (const sw of PERMISSION_SWITCHES) {
    if (choice.switches?.[sw.id] && switchAvailable(sw, levels)) out[sw.key] = true;
  }
  for (const key of choice.extra ?? []) if ((PERMISSION_KEYS as readonly string[]).includes(key)) out[key] = true;
  return out;
}

const COVERED = new Set<AccessPermissionKey>([
  ...PERMISSION_AREAS.flatMap((a) => a.levels.flatMap((l) => l.adds)),
  ...PERMISSION_SWITCHES.map((s) => s.key),
]);

/**
 * A PermissionSet → the choice that shows it. Each area reads as the HIGHEST
 * level whose every key is held; a key held above that (say "delete clients"
 * without "edit clients") is kept in `extra` rather than dropped, so saving the
 * builder unchanged writes back exactly what was there.
 */
export function choiceFromPermissions(perms: PermissionSet | null | undefined): PermissionChoice {
  const p = perms ?? {};
  const levels = {} as Record<PermissionAreaId, string>;
  const explained = new Set<AccessPermissionKey>();
  for (const area of PERMISSION_AREAS) {
    let reached = area.levels[0]!.id;
    for (const level of area.levels) {
      if (!level.adds.every((k) => p[k] === true)) break;
      reached = level.id;
      level.adds.forEach((k) => explained.add(k));
    }
    levels[area.id] = reached;
  }
  const switches = {} as Record<PermissionSwitchId, boolean>;
  for (const sw of PERMISSION_SWITCHES) {
    switches[sw.id] = p[sw.key] === true;
    if (switches[sw.id]) explained.add(sw.key);
  }
  const extra = PERMISSION_KEYS.filter((k) => p[k] === true && (!explained.has(k) || !COVERED.has(k)));
  return { levels, switches, extra };
}

/** A preset's choice, with every area and switch filled in. */
export function choiceOfPreset(id: PermissionPresetId): PermissionChoice {
  const preset = PERMISSION_PRESETS[id];
  const levels = Object.fromEntries(PERMISSION_AREAS.map((a) => [a.id, preset.levels[a.id] ?? 'none'])) as Record<PermissionAreaId, string>;
  const switches = Object.fromEntries(PERMISSION_SWITCHES.map((s) => [s.id, preset.switches[s.id] === true])) as Record<PermissionSwitchId, boolean>;
  return { levels, switches, extra: [] };
}

/** Which preset these permissions are exactly, or null for a custom set. */
export function presetOfPermissions(perms: PermissionSet | null | undefined): PermissionPresetId | null {
  const held = PERMISSION_KEYS.filter((k) => perms?.[k] === true).sort().join(',');
  for (const id of Object.keys(PERMISSION_PRESETS) as PermissionPresetId[]) {
    const p = permissionsFromChoice(choiceOfPreset(id));
    if (PERMISSION_KEYS.filter((k) => p[k] === true).sort().join(',') === held) return id;
  }
  return null;
}
