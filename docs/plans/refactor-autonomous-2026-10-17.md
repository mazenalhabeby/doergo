# Code audit — remaining work, run unattended (from 2026-10-17 evening)

The user asked for the whole remaining list to be planned and done while they are away.
Source of truth for findings: `CODE_AUDIT.md` (§2 bugs, §6 guards, §7 order, §9–§11 progress).

## Ground rules (every phase)

- Work on branch `refactor/code-audit-2026-10` — never `main`, never push, **never deploy, never OTA**.
- No behaviour change unless named here. Every change: typecheck the touched packages, run their tests
  (`--runInBand` when several jobs share the machine), `size-ratchet` ok, then commit the phase.
- Prettier only on files touched (`node tools/format-changed.mjs <files…>`), never the whole repo.
- Guards are repointed or extended, never loosened. A guard that must change in meaning waits for the user.
- At most 3 helper agents at once (7 at once overloaded the machine and stalled 5 of them).
- Anything that changes what a screen LOOKS like waits for the user's mockup review.

## Phase 0 — commit what exists
Branch, then commit: chat phases 1–3 + the audit refactor (steps 1–5) + guards/tools. Mockup audio
(`docs/design/**/*.mp3`) is not committed. The 585 KB PDF pin snapshot is trimmed to the byte hashes first.

## Phase 1 — long lines (> 140 chars), ~4,470 lines in 1,151 files
Mechanical, no behaviour change, package by package (shared → API services → web → phone):
1. Prettier on the files that have long lines (it wraps JSX, calls, objects).
2. What Prettier cannot wrap: long string literals (mostly `className`) → split into adjacent pieces
   with `+` or `cn(...)` already used by the file; template strings split at a space. Same string at runtime.
3. Comments re-wrapped. `size-ratchet --update` after each package.
Exempt as data: push/email/help catalogues, locales, migrations, snapshots.

## Phase 2 — step 7: typed contracts between services
Gateway ↔ services talk over Redis message patterns with untyped payloads (`any`). For each module:
one shared contract (`packages/shared/src/contracts/<module>.ts`: pattern name + request + reply types),
used by the gateway's `send` and the service's `@MessagePattern` handler. Types only — the wire is
unchanged. Order: auth → tasks → attendance → documents → the rest. Also the notification emitter
(`emit('event', payload)`) gets one typed map of event → payload.

## Phase 3 — performance check (measure, then fix what the numbers show)
Local stack, demo data:
- API: time the 30 most used GET routes (p50/p95 over 20 calls); log query counts per request; enable
  `pg_stat_statements` locally and list the slowest/most frequent queries; check for N+1 and missing indexes.
- Web: request count and bytes in the first second on the main pages (budget ≤ 8 requests), bundle sizes.
- Fixes only where the gain is clear and behaviour is identical; each with a before/after number.
  Index additions are written as migrations but NOT applied anywhere but the local DB.

## Phase 4 — step 6: shared UI pieces
Only consolidations whose output is pixel-identical (same classes, same markup) are coded. Where copies
differ visually, a mockup artifact shows the variants and the proposed single look — coding waits for
the user.

## Report
A summary at the top of `CODE_AUDIT.md` (§12): what was done per phase, numbers before/after, what waits
for the user (mockup, the Vienna/UTC calendar zone decision, B3 validation).
