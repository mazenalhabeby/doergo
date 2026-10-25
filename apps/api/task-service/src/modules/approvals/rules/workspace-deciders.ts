import type { ApprovalDecider } from '@hbcfield/shared';

/**
 * One person who may decide something in a workspace today — with HOW (`via`), whether they are on leave,
 * and, for a stand-in, whom they cover (a stand-in never decides about the leader they cover).
 */
export interface WorkspaceDecider extends ApprovalDecider {
  covers: string[];
}

/** The deciders about ONE person: never the person, never a stand-in covering that person. */
export function decidersAbout(list: readonly WorkspaceDecider[], subjectUserId?: string | null): WorkspaceDecider[] {
  if (!subjectUserId) return [...list];
  return list.filter((d) => d.id !== subjectUserId && !d.covers.includes(subjectUserId));
}

/**
 * Who is PUSHED about one member's attendance (clock review A2–A4), in tiers — each runs only when the one
 * before found nobody, so the owner is not told about every late departure in a fifty-person company:
 *
 *   1. the workspace's own deciders and today's stand-ins, nobody on leave
 *   2. the member's watchers (chosen on their Access page)
 *   3. org-wide deciders (managers through their org role), nobody on leave
 *   4. the administrators — so an alert that needs somebody never reaches nobody
 *
 * `mayEscalate: false` stops after step 2 (asking about a member's own request: "never padded with admins").
 */
export function alertRecipients(
  deciders: readonly WorkspaceDecider[],
  watcherIds: readonly string[],
  opts: { subjectUserId?: string | null; mayEscalate: boolean },
): string[] {
  const about = decidersAbout(deciders, opts.subjectUserId);
  const onDuty = about.filter((d) => !d.onLeave);
  const local = onDuty.filter((d) => d.via === 'SPACE' || d.via === 'DELEGATED' || d.via === 'ASSIGNED');
  if (local.length) return unique(local.map((d) => d.id));
  const watchers = watcherIds.filter((id) => id !== opts.subjectUserId);
  if (watchers.length || !opts.mayEscalate) return unique(watchers);
  const org = onDuty.filter((d) => d.via === 'ORG');
  if (org.length) return unique(org.map((d) => d.id));
  return unique(about.filter((d) => d.via === 'ADMIN').map((d) => d.id));
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
