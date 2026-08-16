/**
 * Backfill: stamp assignedTeamId on existing OPEN support tickets by re-running
 * the routing resolver (manual org pin > first matching active rule > null triage).
 *
 * Self-contained (no tsx / no @hbcfield/shared) so it runs with plain `node` inside
 * the prod auth-service container. Idempotent + safe:
 *   - only touches tickets that are NOT closed and have assignedTeamId IS NULL,
 *     so it never clobbers a manual per-ticket (re)assignment.
 * Run AFTER teams + routing rules exist (before that, everything resolves to null
 * and it's a no-op). Re-runnable any time to route freshly-created teams' backlog.
 *
 *   docker exec hbcfield-auth-service node apps/api/auth-service/prisma/backfill-support-teams.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const norm = (v) => String(v ?? '').trim().toLowerCase();
function keyMatches(allowed, value) {
  if (!allowed || allowed.length === 0) return true;
  const v = norm(value);
  if (!v) return false;
  return allowed.some((a) => norm(a) === v);
}
function orgMatches(conditions, org) {
  if (!conditions) return true;
  return (
    keyMatches(conditions.planTier, org.planTier) &&
    keyMatches(conditions.country, org.country) &&
    keyMatches(conditions.state, org.state) &&
    keyMatches(conditions.industry, org.industry)
  );
}
function resolveTeam(org, rules) {
  if (org.supportTeamId) return org.supportTeamId;
  for (const r of rules) if (orgMatches(r.conditions, org)) return r.teamId;
  return null;
}

async function main() {
  const rules = await prisma.supportRoutingRule.findMany({
    where: { isActive: true },
    select: { teamId: true, order: true, conditions: true },
    orderBy: { order: 'asc' },
  });
  console.log(`[backfill] ${rules.length} active routing rule(s)`);

  const tickets = await prisma.supportTicket.findMany({
    where: { assignedTeamId: null, status: { notIn: ['CLOSED'] } },
    select: { id: true, organizationId: true },
  });
  console.log(`[backfill] ${tickets.length} candidate ticket(s) (no team, not closed)`);

  // Cache org attributes so we don't refetch per ticket.
  const orgIds = [...new Set(tickets.map((t) => t.organizationId))];
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, planTier: true, country: true, state: true, industry: true, supportTeamId: true },
  });
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  let stamped = 0;
  for (const t of tickets) {
    const org = orgById.get(t.organizationId);
    if (!org) continue;
    const teamId = resolveTeam(org, rules);
    if (!teamId) continue; // stays in triage
    await prisma.supportTicket.update({ where: { id: t.id }, data: { assignedTeamId: teamId } });
    stamped++;
  }
  console.log(`[backfill] done — stamped ${stamped} ticket(s) to a team`);
}

main()
  .catch((e) => {
    console.error('[backfill] FAILED', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
