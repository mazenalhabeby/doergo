# Session context — 2026-08-19 → 20

Everything from this session, written so it can be reloaded without losing
anything. Read this first; it is the index, and it points at the code.

**State:** all work below is **committed and deployed to production**.
Local `HEAD` == prod (`713d406` = local `24ac0c05`, hashes differ because prod
is patched, not pulled). 56 commits.

---

## 1. How to deploy (the deploy key is dead — patch over SSH)

```bash
S=/tmp/deploy && rm -rf $S && mkdir -p $S
git format-patch -1 HEAD -o $S --no-signature -q
ssh root@65.108.154.26 'rm -rf /tmp/dep && mkdir -p /tmp/dep'
scp -q $S/*.patch root@65.108.154.26:/tmp/dep/
ssh root@65.108.154.26 'cd /opt/doergo \
  && git tag -f prod-pre-<name> HEAD \
  && git am --3way /tmp/dep/0001-*.patch \
  && cd infra/docker \
  && docker compose --env-file .env.production build <service> \
  && docker compose --env-file .env.production up -d <service>'
```

**Non-negotiables**
- ALWAYS `--env-file .env.production`. Without it, redis crash-loops and web
  gets the wrong DOMAIN.
- Build images **one at a time** — building several at once OOMs the box.
- Tag `prod-pre-<name>` **before** `git am`, every time.
- Migrations run from the **auth-service entrypoint** (`migrate deploy`) on
  restart. Deploy auth-service first when a migration is involved.
- Gateway's compose service is `api-gateway`.
- Prod backfill scripts must be **plain `.js`** — there is no `tsx` in the image
  — and live at `/app/apps/api/auth-service/prisma/`, NOT `/app/prisma`. Run
  with `docker compose exec -T -w /app/apps/api/auth-service auth-service node prisma/<file>.js`.

**Verifying a local build without breaking the user's `next dev`:** they usually
have one running on :3000 sharing `.next`. Build into an isolated dir instead —
add `distDir: process.env.NEXT_DIST_DIR || '.next'` to `next.config.ts`, run
`NEXT_DIST_DIR=.next-verify npx next build`, then **restore `next.config.ts`,
`next-env.d.ts` and `tsconfig.json`** — the build rewrites all three.

**Sandbox limits hit this session:** direct `psql` against prod is blocked by the
permission classifier. Ask the user to run DB queries, or use a script executed
inside the container.

---

## 2. Outstanding work

### Workflow migration — Phase 5 is the only phase left
Plan: <https://claude.ai/code/artifact/a3618d1f-a7e3-41f1-80e1-f9c10f624bcf>

| Phase | What | State |
|---|---|---|
| 1 | Close the cross-tenant `workflowId` hole | **done** `a04969b6` |
| 2 | `SpaceWorkflow` join + backfill, invisible | **done** `ae4e467a` |
| 3 | Per-space selection in the UI + module gate | **done** `d342c9de` |
| 4 | The validator | **done** `24ac0c05` |
| 5 | **`WorkflowTemplate` library** | **NOT STARTED** |

Phase 5, from the plan — the two things that must hold:
- The library is **platform-curated and read-only to tenants**. If tenants can
  write to it, one org's edit rewrites another's options.
- "Add from library" **clones** into the org. It must never be a live reference:
  editing a library row would rewrite the state machine under every tenant's
  in-flight tasks, and a task whose status vanishes has no transition out.
- Seed it from the workflows the existing orgs already use.

### Other open items (in rough priority order)
1. **Android 1.0.1 build → Play release.** Android's live train is **1.0.0**;
   iOS is on 1.0.1. Until they converge, EVERY OTA needs two publishes, and an
   OTA published at 1.0.1 silently misses every Android device. Build
   `8ab6f8a8` is finished and submitted to the Play **internal** track — it has
   not been promoted.
2. **Mobile OTA pending user preview.** Standing rule: user previews mobile in
   the Expo dev server FIRST; OTA only after they approve.
3. **`ACCESS_IGNORE_LEGACY_FLAGS` cleanup.** Switch is ON in prod, backfill
   verified 15/15. The `canCreateTasks`/`canViewAllTasks`/… columns still exist
   and are still written by invitations and user creation. Drop them only after
   this has run quietly for a while.
4. **`OSRM_URL` unset in prod** — route maps draw raw GPS instead of
   road-snapped paths. Deliberate: unset means no coordinates leave the network.
5. **Tracking cap not implemented.** If a member ignores the arrival prompt, GPS
   keeps recording indefinitely. The prompt reminds; it does not enforce.
6. **`resolveMemberRouting` reads `spaceAssignment` 3×** on the `contactScope:
   NONE` path. Improved 4 reads → 2 round trips, but the duplication remains.
7. **Members-tab UX**: the picker now loads every member (was capped at 100),
   but it is still a plain `<Select>` — long on a large org.
8. **A project-wide sweep for `toLocale*("en-`** is worth doing. Found twice
   (task detail, invoices + sharing tabs). A scan for untranslated *text* does
   not catch a hardcoded locale inside a format call.
9. **Cross-org group chat does not exist.** Chat is 1:1; a task has no group
   thread.
10. **258 pre-existing lint violations**, incl. 8 `rules-of-hooks` **errors** in
    `settings/workflows` and `tasks/recurring`. Those are genuine bug risk.
11. **Three older commits never deployed** (predate this session):
    `3cf1a76` + `fae9e5c` (CRM member access, `/clients` nav) and `2d270e9`
    (mobile BlurSheet). The mobile one IS on users' phones via an OTA published
    from local; only the server's git copy is stale.

---

## 3. Architecture decided this session — do not undo

### Permissions: the role is authoritative
- `buildResolvedAccess` merges: flat user columns ∪ org role ∪ per-space role ∪
  cross-org share level → `{ org, perSpace, sharedSpaces }`.
- **`mergePermissions` is a UNION — there is no "deny".** A role that omits a
  permission does not withhold it. That is why `ACCESS_IGNORE_LEGACY_FLAGS`
  exists: with the columns read, a role could never restrict anything.
- **Session permission fields are restated from `access`** at BOTH boundaries
  (`login` and `validateToken`) — org-wide only, via `accessAllows` with no
  spaceId. ~75 downstream reads of `req.user.canViewAllTasks` are correct by
  construction because the raw columns never leave auth-service.
- Both call sites must stay in step, or a member gets permissions at sign-in
  that vanish on their next request.
- `accessAllowsInSpace` has **no org fallback**, deliberately: a foreign
  (cross-org shared) space must never be authorized by own-org permissions.

### Chat: permission is re-asked, never granted once
- **Membership is not permission.** `sendMessage` re-checks contact permission
  every time. Reads are deliberately untouched — losing permission ends a
  conversation, it does not retract what was said.
- **Cross-org chat is anchored to a share.** `Conversation.originSpaceId` records
  WHICH share authorized it; every send re-resolves it live. Revoke the share →
  the thread freezes, nothing to invalidate. **Do not replace this with a cached
  flag** — a missed invalidation is a silent hole.
- Both parties need an effective `SpaceAssignment` on the space. Seeing a shared
  space is not licence to message its people.
- Never authorize from `access.sharedSpaces` on the token — it is a ~60s
  snapshot.
- Cross-org conversation rows are anchored to the **space owner's** org, because
  `@@unique([organizationId, dmKey])` would otherwise give one pair two threads.
- Presence and typing **stop at the org boundary**. The typing relay resolves
  recipients from connected sockets, not from the client's payload.

### Tasks: one rule, shared by service and screens
- `mayChangeStatus` / `hasAnyTransition` in `@hbcfield/shared` are called by the
  service, the board, the list and the task page. They drifted when written
  three times.
- A **finished task stops moving**, for everyone — the manager free-move bypass
  does not apply once terminal. `COMPLETED → CLOSED` still works (declared);
  `CANCELED`/`CLOSED` do nothing.
- `canAccessTask` (shared) checks the **organization boundary FIRST**, then
  relationships. A relationship grants access within the boundary, never across.

### Workflows / spaces
- `SpaceWorkflow(spaceId, workflowId, isDefault, position)` decides what a space
  OFFERS. The workflow stays **org-owned** — one definition, so a typo is fixed
  once. `@@unique([spaceId, workflowId])` plus a **partial unique index** on
  `("spaceId") WHERE "isDefault"` so two defaults are unrepresentable.
- `resolveSpaceDefaultWorkflowId` reads the join, falls back to
  `CompanyLocation.workflowId`. That column is still the fallback — drop later.
- Task creation checks the workflow is **owned by the task's org** AND **offered
  by the space**. The org for the check is `effectiveOrgId` (the task's), which
  for a shared space is the OWNER's, not the caller's.
- Module requirement is **derived** from `WorkflowStatus.capabilities`, never
  declared separately (`CAPABILITY_MODULE` in shared).
- Validator runs at **use**, not on every edit — a half-built workflow is
  unfinished, not wrong.

---

## 4. Recurring bug patterns found (look for these first)

1. **Silent failure — an action that evaluates to nothing.** Found ~8×: dead
   `mailto:`, `openChatWith` returning bare, mutations with no `onError`, a
   `console.error`-only attachment upload. If a control can do nothing, it must
   say so or not render.
2. **Lead-assignee blind spot.** `assignedToId` read without `assignees[]`.
   Found 4×. Use `isAssignedTo` / `assigneeIds` (web `src/lib/task-assignment.ts`)
   or `isTaskAssignee` (shared).
3. **One rule written twice, then drifting.** Status rules, tenant checks,
   contact checks. Extract BEFORE the second copy exists.
4. **A field collected and never submitted.** Found 4× across the task dialogs.
   Guards now exist (§5).
5. **Hardcoded locale in a format call.** `toLocaleDateString("en-GB", …)`. A
   text scan does not catch it.
6. **Chrome drawn twice** — a component rendering its own card inside a
   `CollapsibleSection` that already draws one. Found 4×.
7. **Flex `min-width: auto`.** `truncate` does nothing unless EVERY ancestor
   between the fixed width and the text has `min-w-0`.

---

## 5. Guard tests that now exist (do not delete)

- `apps/web-app/src/app/(dashboard)/tasks/_components/__tests__/create-task-dialog.payload.spec.ts` — 31 assertions
- `apps/web-app/src/app/(dashboard)/tasks/[id]/_components/__tests__/edit-task-dialog.payload.spec.ts` — 18
- `apps/web-app/src/__tests__/dialog-payloads.spec.ts` — parameterised, covers invitations / members / spaces; **add a row, not a file**
- `apps/api/task-service/src/modules/chat/__tests__/chat.query-budget.spec.ts` — query-count CEILINGS for a chat send
- `apps/api/task-service/src/common/__tests__/space-access.util.spec.ts` — characterization tests written BEFORE refactoring shared routing

**Method that repeatedly paid off:** after writing a guard, *reintroduce the bug
on purpose* and confirm it fails. Doing so caught flaws in the guards themselves
**three separate times** — a green run proved nothing.

Counts at session end: task-service **272**, web **189**, auth-service **49**,
gateway 8 unit (+19 pre-existing e2e failures needing a live server).

---

## 6. Corrections I had to make (avoid repeating)

- Fixed a bug, told the user it was "not deployed", left it. They tested prod and
  saw the old behaviour. **Deploy the fix or say plainly it is not live.**
- Reported a "2 Activity panels" bug, fixed a nested card, and missed that the
  real cause was two DIFFERENT components with the same title. **Look at what is
  rendered NEXT TO the thing, not only inside it.**
- Blanket-blocked finished tasks from moving → made `CLOSED` unreachable.
  Fixed by consulting the transition table instead of a boolean.
- Published a mobile OTA to runtime 1.0.1 without checking that Android's live
  train is 1.0.0. It reached no Android device.
- Broke the user's dev server twice by running `next build` against a shared
  `.next`. Hence the `NEXT_DIST_DIR` procedure above.

---

## 7. Screenshots

The user drops them at the **repo root** (`01.png`, `02.png`, `03.png`) — they do
NOT arrive as chat attachments. Read the file directly.
