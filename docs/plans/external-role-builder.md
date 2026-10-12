# External members — a permission builder per workspace

User decisions (2026-10-12), mockup: https://claude.ai/artifact/PWFKafhDUwZ3ghP6DumEmk

## Goal

An external member (a client's or partner's person, `User.isExternal`) can be given anything from
watch-only to a full manager of ONE workspace, area by area, with sensitive abilities as separate
switches, on web, app or both. They never leave the workspaces they are assigned to, never see
what the organization owns (invoices, billing, labour cost, personnel files, company members, other
workspaces, calendar, reports) and never hold a clock or leave. The organization pays the seat:
view-only €2 (`isObserverSeat`, unchanged), anything more €9.99.

## Model

### New permission keys (all space-capable, all allowed for externals)

| Key | Meaning | Org flat-field bridge (keeps today's behaviour) |
|---|---|---|
| `canApproveAttendance` | approve / reject entries and excursions | `canReconcileAttendance` ∨ `canManageUsers` |
| `canDeleteAttendance` | delete a time entry | `canReconcileAttendance` ∨ `canManageUsers` |
| `canViewAssets` | read assets in scope | `canViewAllTasks` |
| `canLogAssets` | log use, fuel, expenses on assets in scope | `canManageAssets` |
| `canViewPortal` | read portal requests in scope | `canManagePortals` |
| `canAnswerPortal` | triage, reply, change status of portal requests | `canManagePortals` |
| `canAddSpaceMembers` | add / remove people in the workspace | `canManageUsers` |
| `canGrantSpaceRoles` | give people in the workspace a role (ceiling applies) | `canManageUsers` |

`canManagePortals` becomes space-capable. The CRM keys, `canManageAssets` and `canViewTracking`
already are in the schema; the work is making the SERVER honour them per space.

Role JSON migration: every role holding `canReconcileAttendance` gains `canApproveAttendance` +
`canDeleteAttendance`; every role holding `canManageUsers` gains `canAddSpaceMembers` +
`canGrantSpaceRoles`; every role NOT assigned to an external and holding `canViewAllTasks` gains
`canViewAssets` (asset reads were on `canViewAllTasks`); holders of `canManageAssets` gain
`canLogAssets`; holders of `canManagePortals` gain `canViewPortal` + `canAnswerPortal`. Nobody loses
or gains anything on the day it ships.

### External allowance

`EXTERNAL_ALLOWED_PERMISSIONS` = every SPACE-capable key except `canManageUsers` (space
`canManageUsers` also sets member bill rates) and `canViewReports` (reports are org-owned).
Still an allow-list: a new key is refused for externals until added on purpose.

### Levels, presets, switches — `packages/shared/src/access/permission-levels.ts`

ONE definition read by the web builder, the phone, the server's validation and tests:
areas → ordered levels → key sets (cumulative), on/off switches, presets (observer, supervisor,
workspace manager). `permissionsFromChoice(choice)` and `choiceFromPermissions(perms)` round-trip.

### Per-person permissions = a PERSONAL role

`Role.personalAssignmentId` (unique, nullable): a role owned by one space assignment, hidden from
every role list and picker. The builder saves a preset as the built-in role when unchanged, else
upserts that assignment's personal role and points `SpaceAssignment.roleId` at it. Every existing
check — whitelist, external allow-list, grant ceiling, re-bill, resolver — applies unchanged.
External invitations carry `Invitation.spacePermissions` (validated at create; applied on accept).

## Server work

1. Shared model + migration + flat fields derived from one bridge table (`ORG_FLAG_BRIDGES`) —
   fixes the CRM flat-field bug (`crmEditInfo`/`crmManageClients` never built).
2. Attendance: approve/reject/bulk/excursions → `canApproveAttendance`; delete entry →
   `canDeleteAttendance`; correct stays `canReconcileAttendance`.
3. CRM per space: `crmReachOf(access)` = org caps + per-space caps (no legacy bridge per space);
   list/get/create/update/delete narrowed to reachable spaces; space grants need the workspace's
   `crm` module. `@DenyExternal` removed from customers EXCEPT import/match-keys (phone address book
   is org-owned).
4. Assets per space: reads `canViewAssets`, logs `canLogAssets`, writes `canManageAssets`, all
   `RequirePermissionInSpace` + narrowed by the asset's category space. `@DenyExternal` removed.
5. Portal per space: space-portal + requests narrowed by portal's space; view/answer/manage.
   `@DenyExternal` removed for these.
6. Space members: assign/remove → `canAddSpaceMembers`; member role → `canGrantSpaceRoles`
   (ceiling); bill rates/work roles stay `canManageUsers` (never external).
7. Security: a route-walking spec — every controller route reachable by an external must be space
   scoped; an e2e (`tools/external-access-e2e.py`) proving no cross-workspace reach.

## Client work

- Web: the builder (invite + member panel), external-visible CRM/assets/portal pages gated by
  permission, not `denyExternal`.
- Phone: CRM / assets / portal rows for externals by permission (`crmCapsOf` per space).

## Never for externals (unchanged, enforced)

invoices, billing, labour cost, personnel documents, company members/invitations, calendar,
reports/analytics, legal entities, other workspaces, own clock / auto-clock / leave, address-book
import, route optimizer.
