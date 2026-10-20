# Glossary — one word per thing

> **Status: PROPOSED (2026-10-20), waiting for the owner's OK.** Phase 1 of
> `docs/plans/code-structure-fix.md` renames code to these words. Until then this page says what
> each old name means, so nobody adds a fourth.

The rule: **new code uses the word in the first column.** Database tables keep their names
(Prisma `@@map`), and old API routes stay as aliases until the phones that call them are gone.

| The word | What it is | Old names still in the code | Database model (unchanged) |
|---|---|---|---|
| **Workspace** (code: `space`) | A place or team where work happens — an office, a depot, a client site, a project | location, company location, space | `CompanyLocation` (`company_locations`) |
| **Member** | A person in the organization who signs in — staff or external | technician, employee, worker, people, user (in UI) | `User` |
| **Client** | A company or person you do work for | customer | `Customer` |
| **Job** (code: `task`) | One piece of work to do | task | `Task` |
| **Shift** | Planned working time | schedule, rota slot | `Shift`, `ShiftAssignment` |
| **Time entry** | A clock-in to clock-out record | attendance record, entry | `TimeEntry` |
| **Option** | Something bought once for the whole organization | add-on | `Organization.addOns` |
| **Module** | Something switched on per workspace | — | `CompanyLocation.enabledModules` |

## Words that must NOT be used for these

- **"location"** only for a GPS position (`LocationHistory`, `WorkerLastLocation`, the tracking
  service) — never for a workspace.
- **"user"** only for the account record in code, never in a sentence a person reads ("member").
- **"customer"** only where the database model forces it; screens, routes and new files say client.

## Decisions still open

1. Are **Workspace / Member / Client** the right three words? (owner)
2. Do routes change too (`/locations` → `/workspaces`, `/customers/[id]` → `/clients/[id]`), with
   redirects for old links? — Phase 1.2–1.3.
