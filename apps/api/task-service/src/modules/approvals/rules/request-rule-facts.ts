import { isAbsence, notEndedWhere, type RuleFacts } from '@hbcfield/shared';

/**
 * A leave / request item as office rules read it — ONE builder for the approve path (time-off-decision), the
 * "nobody answers" sweep and the rules page, so they can never read a request two ways. The workspaces are the
 * request's own, else the member's CURRENT ones; the days are the counted working days.
 */
export const REQUEST_RULE_SELECT = {
  id: true,
  technicianId: true,
  startDate: true,
  endDate: true,
  workingDays: true,
  kind: true,
  spaceId: true,
  technician: { select: { spaceAssignments: { where: notEndedWhere(), select: { spaceId: true } } } },
} as const;

export interface RequestRuleRow {
  id: string;
  technicianId: string;
  startDate: Date;
  endDate: Date;
  workingDays: number | null;
  kind: string;
  spaceId: string | null;
  technician: { spaceAssignments: { spaceId: string }[] };
}

export function requestRuleFacts(t: RequestRuleRow, coverShort: boolean, workingDays?: number | null): RuleFacts {
  return {
    spaceIds: t.spaceId ? [t.spaceId] : t.technician.spaceAssignments.map((a) => a.spaceId),
    days: workingDays ?? t.workingDays ?? Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86_400_000) + 1,
    coverShort,
  };
}

/** Would people be short — the wallchart's own verdict (CoverService), for leave only, in ONE batch. */
export async function requestsCoverShort(
  cover: {
    assessMany(
      org: string,
      rows: Array<{ id: string; technicianId: string; startDate: Date; endDate: Date }>,
    ): Promise<Map<string, unknown>>;
  },
  organizationId: string,
  rows: RequestRuleRow[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const leave = rows.filter((r) => isAbsence(r.kind));
  if (!leave.length) return out;
  try {
    const verdicts = await cover.assessMany(
      organizationId,
      leave.map((r) => ({ id: r.id, technicianId: r.technicianId, startDate: r.startDate, endDate: r.endDate })),
    );
    for (const [id, v] of verdicts) {
      const level = (v as { level?: string } | null)?.level;
      out.set(id, level === 'short' || level === 'skill');
    }
  } catch {
    // Unreadable cover: a cover-only rule does not fire, rather than firing on a guess.
  }
  return out;
}

/**
 * A request's facts for the approve path: cover is worked out only when a rule of the organization asks about it
 * (asking costs four reads of the wallchart). ONE call for approving, recording and re-dating leave.
 */
export async function requestFactsFor(
  rules: { asksAboutCover(organizationId: string): Promise<boolean> },
  cover: Parameters<typeof requestsCoverShort>[0],
  organizationId: string,
  row: RequestRuleRow,
  workingDays?: number | null,
): Promise<RuleFacts> {
  const coverShort =
    (await rules.asksAboutCover(organizationId)) &&
    ((await requestsCoverShort(cover, organizationId, [row])).get(row.id) ?? false);
  return requestRuleFacts(row, coverShort, workingDays);
}
