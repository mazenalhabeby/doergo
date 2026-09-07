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

export type ExplainerKind = 'module' | 'option';

export interface ExplainerMeta {
  /** Module key or add-on key. Must match the billing catalogue exactly. */
  key: string;
  kind: ExplainerKind;
  icon: LucideIcon;
}

/*
  There is no `diagram` field. Each module and option has its OWN drawing,
  looked up by this same key in `components/explainer/diagrams.tsx` — a shared
  set of generic shapes was tried first and was worse than no picture at all,
  because Epics and Subtasks rendered the identical four blank rectangles.
*/

/** Per-workspace modules. Keys mirror `AVAILABLE_MODULES`. */
const MODULES: ExplainerMeta[] = [
  { key: 'subtasks', kind: 'module', icon: ListTree },
  { key: 'checklists', kind: 'module', icon: CheckSquare },
  { key: 'attachments', kind: 'module', icon: Paperclip },
  { key: 'dependencies', kind: 'module', icon: GitBranch },
  { key: 'custom_fields', kind: 'module', icon: Tags },
  { key: 'tracking', kind: 'module', icon: Route },
  { key: 'service_reports', kind: 'module', icon: FileSignature },
  { key: 'time_tracking', kind: 'module', icon: Clock },
  { key: 'assets', kind: 'module', icon: Boxes },
  { key: 'sprints', kind: 'module', icon: Target },
  { key: 'story_points', kind: 'module', icon: Sparkles },
  { key: 'epics', kind: 'module', icon: Layers },
  { key: 'phases', kind: 'module', icon: MapPinned },
  { key: 'crm', kind: 'module', icon: Users },
  { key: 'b2c_portal', kind: 'module', icon: Building2 },
  { key: 'space_sharing', kind: 'module', icon: Share2 },
];

/** Organization-wide options. Keys mirror `AVAILABLE_ADD_ONS`. */
const OPTIONS: ExplainerMeta[] = [
  { key: 'workflows', kind: 'option', icon: GitBranch },
  { key: 'recurring', kind: 'option', icon: Repeat },
  { key: 'shift_scheduling', kind: 'option', icon: CalendarDays },
  { key: 'overtime', kind: 'option', icon: AlarmClock },
  { key: 'invoicing', kind: 'option', icon: Coins },
  { key: 'reports_builder', kind: 'option', icon: LineChart },
  { key: 'report_scheduling', kind: 'option', icon: Send },
  { key: 'audit_log', kind: 'option', icon: History },
  { key: 'documents', kind: 'option', icon: FileText },
  { key: 'priority_routing', kind: 'option', icon: Filter },
  { key: 'live_chat', kind: 'option', icon: MessagesSquare },
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
