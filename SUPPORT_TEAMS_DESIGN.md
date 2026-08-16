# Support Teams & Dynamic Routing — Design

> Goal: run platform support like the big desks (Zendesk / Salesforce Service Cloud /
> Freshdesk) — **support managers each own a slice of the customer base**, tickets
> auto-route to the right team, and every agent sees only the queue they're
> responsible for, while the Owner sees everything.
> Last updated: 2026-08-16

---

## 1. What the big desks do (the patterns we're adopting)

| Pattern | Zendesk | Salesforce | Freshdesk | What we take |
|---|---|---|---|---|
| **Roles ≠ Groups** | Role = permissions; Group = which tickets you handle | Profile/PermSet vs Queue | Role vs Group | Keep our **platform role** (OWNER/CONTROLLER/SUPPORT/BILLING) for *permissions*; add **Support Teams** for *which tickets you handle*. Two independent axes. |
| **Queue → routing** | Trigger routes to a group | Omni-Channel routes to a queue | Omniroute round-robin/load/skill | A ticket resolves to a **team** at creation via **routing rules** on org attributes. |
| **Scoped visibility** | Staff see their group; Team Leads see all their group; Admins see all | Queue membership | Group agents | Agents see **their teams' queue + the unassigned triage queue**; supervisors (Owner/Controller) see **all**. |
| **Manual override** | Manual assignment beats trigger | Manual owner | Manual assign | An org can be **pinned** to a team (VIP), which **wins over rules**. |
| **Tiered SLA / priority** | SLA policy per priority | Entitlements | SLA policies | Already have it (`sla.ts`, tier→priority, delayed-BullMQ breach). Teams inherit it. |
| **Escalation & ownership** | Team Lead reassigns | Owner change | Reassign | Team **MANAGER** can assign tickets to agents in their team + manage their team's roster. |

**The core idea for us:** the SaaS support org helps *customer organizations*. So "different
managers for all the orgs" = **segment the customer base by org attributes** (plan tier,
country/region, industry) into **books of business**, each owned by a **Support Team** with a
**manager**. Smart default (rules) + escape hatch (manual pin) — the option you chose.

---

## 2. Model (new)

```
SupportTeam            id, name, color, description, isActive
  └─ members           SupportTeamMember  (platformUserId, teamRole = MANAGER | AGENT)
  └─ routingRules      SupportRoutingRule (order, isActive, conditions: JSON predicate on org attrs)
  └─ pinnedOrgs        Organization.supportTeamId  (manual override, wins over rules)

SupportTicket.assignedTeamId   ← stamped at creation by the resolver (indexed)
SupportTicket.assignedAgentId  ← already exists (individual owner within the team)
```

**Routing rule `conditions`** (JSON, all keys AND-ed; list values OR-ed inside a key):
```jsonc
{ "planTier": ["professional", "business", "enterprise"],
  "country":  ["AT", "DE", "CH"],
  "industry": ["HVAC"] }        // omit a key = "any"
```

**Resolver — `resolveTeamForOrg(org)`** (pure, shared, used at create-time AND backfill):
1. `org.supportTeamId` set? → that team (manual pin wins).
2. else first **active** routing rule (by `order`) whose conditions all match → its team.
3. else `null` → **unassigned triage queue** (everyone with `manageSupport` sees it).

## 3. Access (the scoped inbox)

`agentInbox` gains a caller scope `{ platformUserId, isSupervisor, teamIds[] }`:

- **Supervisor** (OWNER, CONTROLLER) → no team filter. Sees all.
- **Agent/Manager** → `assignedTeamId ∈ teamIds` **OR** `assignedTeamId IS NULL` (triage) **OR** `assignedAgentId = me`.

This is O(indexed) — visibility is a column filter on the ticket, not a scan of orgs, because the
team is **stamped on the ticket at creation**. New capability **`manageSupportTeams`** (OWNER,
CONTROLLER) gates team/rule/pin administration; a team **MANAGER** may manage their own team's
roster and reassign within it.

## 4. Phases

- **Phase 1 (this pass) — foundation + scoped inbox.** Schema + migration + backfill; resolver at
  create-time; scoped `agentInbox`; team/rule/pin CRUD endpoints; admin **Teams** screen + inbox
  **scope filter** (My teams / Unassigned / All) + **assign** controls. Round-robin/load routing
  *within* a team is deferred — Phase 1 routes to the **team**, humans pick up from the queue.
- **Phase 2 — auto-assign within a team** (round-robin / load-balanced with per-agent capacity),
  manager reassignment UI, agent presence/availability, saved views, CSAT, resolution SLA.
- **Phase 3 — skills & languages** (skill tags on agents + rules), business-hours/on-call per team,
  analytics per team/manager.

## 5. Safety / DRY notes

- Additive migration only (`assignedTeamId`, new tables, `Organization.supportTeamId` nullable) —
  every existing ticket stays valid; backfill is an **idempotent script** (not SQL-in-migration),
  stamping `assignedTeamId` by re-running the resolver per org.
- Resolver + condition-matcher live in `@hbcfield/shared` so create-time (task-service) and
  backfill (auth-service) can't drift.
- Reuses the existing SLA/priority engine untouched; the `[assignedAgentId, status]` index already
  in the schema finally gets used, plus a new `[assignedTeamId, status]`.
- Two agent entry points exist today (RBAC `/platform/support/*` used by `apps/admin`, and the
  legacy secret-key `/support/agent/*` used by the web-app operator page). **Phase 1 scopes the
  RBAC path** (the future); the legacy path keeps its all-tickets behavior until it's retired.
