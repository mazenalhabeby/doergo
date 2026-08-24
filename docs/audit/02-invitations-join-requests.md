# Area 02 — Invitations & Join Requests

Routes: `/invitations`, `/join-requests`, `/onboarding/*`, plus the two **public**
endpoints `GET /invitations/validate/:code` and `POST /invitations/accept`.

Status: **All six passes run. All 4 findings fixed.** 1 High, 2 Medium, 1 Low.

---

## A. What this feature is (from the code)

**In one paragraph:** there are two ways into an organization and they are deliberately
asymmetric. An admin **issues an invitation code** — six (now ten) characters, pre-loaded
with the role, position, schedule, space and full Access Profile the new member should get
— and whoever presents that code registers straight into the org with exactly that access,
no approval step. Alternatively a person who already has an account enters the
organization's **join code**, which does *not* grant anything: it files a `JoinRequest` an
admin must approve, choosing the role at approval time. Invitations are the fast path with
the trust placed in the code; join requests are the slow path with the trust placed in a
human.

### Public attack surface

| Endpoint | Auth | Throttle | Returns |
|---|---|---|---|
| `GET /invitations/validate/:code` | **`@Public()`** | 10/min | valid, targetRole, **organizationName**, position, specialty, expiry |
| `POST /invitations/accept` | **`@Public()`** | 5/min | creates a user in that org |
| `GET /onboarding/validate-org-code/:code` | JWT | 10/min | org name |
| `POST /onboarding/join-by-code` | JWT | 5/min | files a request — grants nothing |

### Reads / writes

`["invitations", params]` and `["join-requests", params]`, both paginated server-side
(`min(limit, 50)`), both with narrow relation selects. Mutations: create, revoke, approve,
reject — every one invalidates its own key, and the invitations page already applies an
optimistic `setQueriesData` on revoke.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| A-B1 | **H** | B | A 2^30 invitation code is the *only* credential for joining an org | **fixed** |
| A-D1 | M | D | A new join request toasts but never appears in the list | **fixed** |
| A-D2 | M | D | Rejecting a request does not reach the other admin looking at it | **fixed** |
| A-B2 | L | B | The plaintext code is stored, and CLAUDE.md claimed the opposite | **fixed** |

### A-B1 — the code *is* the credential **(High)**

`Invitation` has **no email column** (`schema.prisma:2478`). `acceptInvitation` takes the
email from the request body and never compares it to anything
(`invitation.service.ts:463`). That is a deliberate product choice — the code is shareable
by any channel — but it means the code is a pure bearer credential, and the whole security
of the flow rests on guessing it.

It was six characters over a 32-symbol alphabet:

| Length | Keyspace | 500-IP pool vs ~200 live invitations |
|---|---|---|
| 6 (before) | 32^6 ≈ 1.07e9 (~2^30) | **~18 hours** |
| 10 (now) | 32^10 ≈ 1.13e15 (~2^50) | ~2,100 years |

The rate limits (10/min validate, 5/min accept) are per **IP** and held in **process
memory**, so they bound one attacker on one machine against one replica — not a proxy pool,
and not a horizontally-scaled gateway. And `validate` is the perfect oracle: it is public,
cheap, and answers "is this code real, and which company is it for?".

What a hit yields: an authenticated `EMPLOYEE` account inside a stranger's tenant, with
whatever Access Profile the invitation carried. Not ADMIN — `createInvitation` refuses
`targetRole: ADMIN` outright (`:119`) — but enough to read the org.

**Fixed** by raising `INVITATION_CODE_LENGTH` 6 → 10. One constant, no migration; existing
codes keep working because validation is a hash lookup and the accept DTO still accepts a
6-character minimum.

### A-D1 / A-D2 — the pending list lies in both directions

`join_request_submitted` is emitted to the org room and to the routed approvers
(`join-request-notification.handler.ts:40,53`), and `notification-bell.tsx:254` shows a
toast for it — but the event was not in `EVENT_INVALIDATIONS`, so an admin **sitting on
`/join-requests`** was told a request had arrived and then did not see it on the page in
front of them (A-D1).

Rejection had the mirror problem: it emitted only to the rejected user, so a second admin's
list kept the request as pending and they could act on an already-decided one (A-D2).

**Fixed**: `join_request_submitted` now invalidates `["join-requests"]`, and reject
broadcasts `member.changed` the way approve already did.

### A-B2 — the hash is an index, not a protection

`schema.prisma:2482` — `code String?` alongside `codeHash String @unique`, and
`invitation.service.ts:278` stores the plaintext deliberately so an admin can re-copy a
code from the list. That is a legitimate trade-off, and `GET /invitations` returning the
code is the feature working as designed.

What was not legitimate: **CLAUDE.md line 741 claimed "plaintext never stored"**. The team
was reading a security property the code does not have — a database dump exposes every live
invitation code. **Fixed** by correcting the document rather than breaking the feature, and
by stating the bearer-credential property explicitly next to it.

---

## Verified good (checked, no finding)

- **Escalation ceilings on invitation creation are present and correct.** A non-admin
  creator may only invite `EMPLOYEE` (`:110`); `ADMIN` invitations are refused outright for
  everyone (`:119`); a pre-assigned `memberRoleId` is validated against the org **and**
  ceiling-checked against the creator's own permissions (`:199-214`); the pre-configured
  Access Profile is capped by `capAccessProfilePerms` at create *and* re-sanitised by
  `normalizeAccessProfile` on accept. The role applied on accept comes from the stored
  invitation, never from the request body — no role injection.
- **No modulo bias.** `randomBytes(n)[i] % 32` is uniform because 256 is a multiple of 32.
  The charset also excludes `I O 0 1`, which matters for a code a human retypes.
- **The org join code is the strong one** — 8 chars (2^40) *and* it grants nothing without
  human approval. The asymmetry is the right way round in kind; A-B1 was that the code
  which grants access directly was the shorter of the two.
- **The `@Throttle` name trap is already handled.** Per-route `@Throttle({ default: … })`
  only overrides a throttler literally named `default`, and `app.module.ts:75` has a
  comment saying so, with the fourth named entry present. Effective limit on validate is
  10/min, as intended.
- **Pagination** capped server-side on both lists; relation `select`s are narrow.
- **Both pages already had real error states** with retry, and revoke was already optimistic.
- **i18n**: 136 distinct keys across the 9 files of this area, **0 missing** in de/es/fr/it.

## Open questions

- The Throttler has **no shared storage** — limits are per replica, in process memory. With
  one gateway that is correct; the moment it scales to N replicas every limit in the product
  becomes N× looser, login included. This is **cross-cutting, not Area 02**, and it sits
  directly on the horizontal-scaling path the cron-lock work opened up. Recorded here
  because this is where it first bites.
- Should `validate/:code` return `organizationName` before the code is accepted? It makes
  the oracle more useful to a guesser. Removing it would hurt the legitimate flow ("you are
  joining Acme GmbH") — a product call, not a defect.

## Verdict

**PASS WITH FIXES** — the High is closed by a one-constant change with no migration and no
break in existing codes.
