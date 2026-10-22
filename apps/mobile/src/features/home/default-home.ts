import { hasAccessModule } from '@hbcfield/shared/client';
import type { User } from '../../lib/api/types';
import type { HomeLayout } from './layout-store';

/**
 * THE HOME A NEW MEMBER STARTS WITH: TWO WIDGETS, CHOSEN FOR THEIR WORK.
 *
 * It used to be every widget they were allowed, stacked — five cards for an
 * admin, most of them about somebody else's job. Two is what fits above the
 * fold; the rest wait in the gallery.
 *
 * The kind of member is read off what they are ENTITLED to (`available`,
 * which `availableWidgets` already decided), never off a role's name: roles
 * are edited per organization, and asking the registry's own question means
 * the two cannot disagree.
 *
 * Chosen ONCE, the first time the home opens, and saved as the member's own
 * layout. From then on it is theirs to arrange, and nothing here moves it.
 */
const DEFAULT_HOME_SIZE = 2;

type Persona = 'lead' | 'sales' | 'driver' | 'worker';

/** What each kind of member starts with, best first. */
const PICKS: Record<Persona, string[]> = {
  // A manager or supervisor: who is working, and the jobs.
  lead: ['crew', 'my-work', 'clients', 'shift-clock'],
  // A sales rep: the client book, then what carries them between visits.
  sales: ['clients', 'my-route', 'my-work', 'shift-clock'],
  // On the road: the clock and today's stops.
  driver: ['shift-clock', 'my-route', 'my-work'],
  // On site: the clock and the work.
  worker: ['shift-clock', 'my-work'],
};

export function defaultHomeKeys(user: User | null | undefined, available: readonly string[]): string[] {
  const has = new Set(available);
  // My work draws nothing for a member with neither jobs nor a clock — never spend a slot on it.
  if (!hasAccessModule(user as never, 'tasks') && !hasAccessModule(user as never, 'clock')) has.delete('my-work');
  const persona: Persona = has.has('crew') ? 'lead' : has.has('clients') ? 'sales' : has.has('my-route') ? 'driver' : 'worker';
  const out: string[] = [];
  // The persona's picks, then anything useful left, so two stays two where the member is allowed two.
  for (const k of [...PICKS[persona], 'my-work', 'shortcuts', ...available]) {
    if (out.length === DEFAULT_HOME_SIZE) break;
    if (has.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * The first layout, written as a layout: the defaults shown and every other
 * widget already switched off.
 *
 * ⚠️ NOT JUST THE TWO KEYS. The hook appends any default-order key missing
 * from a saved list ("the registry gained it since"), so saving only two keys
 * — which the first hide or move does — would bring the other three back the
 * moment the member touched anything.
 */
export function seedLayout(defaults: readonly string[], allKeys: readonly string[]): HomeLayout {
  const rest = allKeys.filter((k) => !defaults.includes(k));
  return { keys: [...defaults, ...rest], hidden: rest };
}
