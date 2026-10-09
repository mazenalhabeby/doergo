/**
 * Keep only ids that are real users in THIS organization.
 *
 * Drops cross-tenant and stale ids so a client's managers, a reminder's
 * assignee or an apartment's resident can never point outside the org. The
 * CRM and the portal each had a copy; the portal's also deduped and capped.
 * One helper now: always deduped (a manager listed twice is one manager), and
 * the cap is the caller's — the CRM has never capped, the portal caps at 20.
 */
export async function keepOrgUserIds(
  prisma: { user: { findMany(args: any): Promise<Array<{ id: string }>> } },
  ids: readonly unknown[] | null | undefined,
  organizationId: string,
  opts: { cap?: number } = {},
): Promise<string[]> {
  let clean = Array.from(new Set((ids ?? []).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)));
  if (opts.cap !== undefined) clean = clean.slice(0, opts.cap);
  if (!clean.length) return [];
  const rows = await prisma.user.findMany({ where: { id: { in: clean }, organizationId }, select: { id: true } });
  const ok = new Set(rows.map((r) => r.id));
  return clean.filter((id) => ok.has(id));
}
