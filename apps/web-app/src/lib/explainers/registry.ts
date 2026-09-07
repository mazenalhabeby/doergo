import {
  AlarmClock, Boxes, Building2, CalendarDays, CheckSquare, Clock, Coins,
  FileSignature, FileText, Filter, GitBranch, Headset, History, Layers,
  LineChart, ListTree, MapPinned, MessagesSquare, Paperclip, Repeat, Route,
  Send, Share2, Sparkles, Tags, Target, Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * What a module or option IS — the structural half of an explainer.
 *
 * Every word a person reads lives in i18n (`src/i18n/explainers/*.json`) under
 * `<key>.*`. This file holds only the parts that cannot be translated: which
 * icon to draw, which diagram to draw, and whether the thing is bought per
 * workspace or once for the organization.
 *
 * The split matters for weight as much as for translation. The copy is roughly
 * 30 KB per language across 28 entries; loading five languages of it into the
 * main bundle would undo the bundle work done to get the marketing pages down.
 * So the copy is a SEPARATE i18next namespace, fetched the first time somebody
 * opens an explainer — see `loadExplainers()`.
 *
 * `src/__tests__/explainers.spec.ts` fails when a module or option exists with
 * no entry here, or an entry here names a key that no longer exists, or any of
 * the five languages is missing a string. A missing explainer is invisible
 * otherwise: the button simply does not render, and nobody notices the gap.
 */

/** The reusable diagram primitives. Deliberately few — see `diagrams.tsx`. */
export type DiagramId =
  | 'flow'        // ordered states with arrows between them
  | 'timeline'    // planned vs actual along a time axis
  | 'hierarchy'   // a parent with children
  | 'map'         // a route between pins
  | 'stack'       // records filed on top of each other
  | 'split'       // two parties sharing one thing
  | 'checklist'   // items ticked off in order
  | 'chart';      // figures rolled up into a shape

export type ExplainerKind = 'module' | 'option';

export interface ExplainerMeta {
  /** Module key or add-on key. Must match the billing catalogue exactly. */
  key: string;
  kind: ExplainerKind;
  icon: LucideIcon;
  /** Omitted where a picture would add nothing — the dialog then has no figure. */
  diagram?: DiagramId;
}

/** Per-workspace modules. Keys mirror `AVAILABLE_MODULES`. */
const MODULES: ExplainerMeta[] = [
  { key: 'subtasks',        kind: 'module', icon: ListTree,       diagram: 'hierarchy' },
  { key: 'checklists',      kind: 'module', icon: CheckSquare,    diagram: 'checklist' },
  { key: 'attachments',     kind: 'module', icon: Paperclip,      diagram: 'stack' },
  { key: 'dependencies',    kind: 'module', icon: GitBranch,      diagram: 'flow' },
  { key: 'custom_fields',   kind: 'module', icon: Tags,           diagram: 'checklist' },
  { key: 'tracking',        kind: 'module', icon: Route,          diagram: 'map' },
  { key: 'service_reports', kind: 'module', icon: FileSignature,  diagram: 'stack' },
  { key: 'time_tracking',   kind: 'module', icon: Clock,          diagram: 'timeline' },
  { key: 'assets',          kind: 'module', icon: Boxes,          diagram: 'stack' },
  { key: 'sprints',         kind: 'module', icon: Target,         diagram: 'timeline' },
  { key: 'story_points',    kind: 'module', icon: Sparkles,       diagram: 'chart' },
  { key: 'epics',           kind: 'module', icon: Layers,         diagram: 'hierarchy' },
  { key: 'phases',          kind: 'module', icon: MapPinned,      diagram: 'flow' },
  { key: 'crm',             kind: 'module', icon: Users,          diagram: 'split' },
  { key: 'b2c_portal',      kind: 'module', icon: Building2,      diagram: 'split' },
  { key: 'space_sharing',   kind: 'module', icon: Share2,         diagram: 'split' },
];

/** Organization-wide options. Keys mirror `AVAILABLE_ADD_ONS`. */
const OPTIONS: ExplainerMeta[] = [
  { key: 'workflows',         kind: 'option', icon: GitBranch,      diagram: 'flow' },
  { key: 'recurring',         kind: 'option', icon: Repeat,         diagram: 'timeline' },
  { key: 'shift_scheduling',  kind: 'option', icon: CalendarDays,   diagram: 'timeline' },
  { key: 'overtime',          kind: 'option', icon: AlarmClock,     diagram: 'flow' },
  { key: 'invoicing',         kind: 'option', icon: Coins,          diagram: 'chart' },
  { key: 'reports_builder',   kind: 'option', icon: LineChart,      diagram: 'chart' },
  { key: 'report_scheduling', kind: 'option', icon: Send,           diagram: 'timeline' },
  { key: 'audit_log',         kind: 'option', icon: History,        diagram: 'stack' },
  { key: 'documents',         kind: 'option', icon: FileText,       diagram: 'stack' },
  { key: 'priority_routing',  kind: 'option', icon: Filter,         diagram: 'flow' },
  { key: 'live_chat',         kind: 'option', icon: MessagesSquare },
  { key: 'dedicated_support', kind: 'option', icon: Headset },
];

const BY_KEY: ReadonlyMap<string, ExplainerMeta> = new Map(
  [...MODULES, ...OPTIONS].map((e) => [e.key, e]),
);

export const EXPLAINER_KEYS: readonly string[] = [...BY_KEY.keys()];

/** The entry for a key, or undefined when nothing has been written yet. */
export function explainerFor(key: string): ExplainerMeta | undefined {
  return BY_KEY.get(key);
}
