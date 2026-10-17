# Phone UI pieces — what was merged, and the variants that wait for a mockup

Phase 4 of `docs/plans/refactor-autonomous-2026-10-17.md` (CODE_AUDIT.md §4, phone rows).
Rule: only copies that render the SAME tree with the SAME resolved style values were merged.
Everything below "Variants" differs on screen today; picking one look is a visual change and
waits for the user's mockup review.

## Merged (no visual change)

| Row | Copies merged | One source |
|---|---|---|
| Tone → colour ternary | 16 ternaries in 12 files (settings-ui, action-strip, strip-box, precheck-card, state-eyebrow ×2, sheet-option, sheet-option-fields, documents/equipment helpers, both issue sheets, type-chooser ×2) | `src/theme/tone-color.ts` `toneColor` / `toneTint` — every call site's tone type is a subset of the mapping, so each returns the value it had; pinned in `theme/__tests__/tone-color.spec.ts` (both themes) |
| "Loading…" line | 14 (4 muted captions; 5 centred on glass with 24 px; 3 with 32 px; 1 with 16 px; 1 centred, no padding) | `src/components/loading-line.tsx` `<LoadingLine />` / `<LoadingLine onGlass padUnits={n} />` |
| "Not allowed" lock | 2 (scan-card, asset-expense — identical) | `src/components/not-allowed.tsx` `<NotAllowed message />` |
| job-ui used as the UI kit | `state-eyebrow`, `sheet-option`, `sheet-option-fields` moved UNCHANGED into `components/amazen/`; 105 importers now import those 12 names from the amazen barrel (`Tone` is exported there as `OptionTone`); `job/job-ui.tsx` re-exports them and keeps `JobSheet` | amazen barrel |

## Variants (not changed — decide one look in a mockup)

### Count badge — 7 looks, none equal
| Where | Look |
|---|---|
| `amazen/disc.tsx:94` | 18 px, warn fill, caps at **99+**, absolute top/right 4 |
| `amazen/filter.tsx:72` (ChoicePill) | 18 px, critical fill, 11 px medium text, 9+, pops on change |
| `amazen/tab-pill/tab-slot-helpers.tsx:16` | 19 px, critical fill, 2 px ring in the bar colour, optional glow, 9+ |
| `home/shortcuts-editor-helpers.tsx:8` | 19 px, **warn** fill, ring, 10 px text, absolute 6/6, 9+ |
| `app/(customer)/(tabs)/index.tsx:99` | legacy StyleSheet, tile-coloured fill, 9+ |
| `screens/app/support-screen-helpers.tsx:39` | legacy `COLORS.primary` pill, radius 10, no cap |
| `multi-page-capture.tsx:73` | page NUMBER, square-ish radius 6 — not a count; leave out |
Proposed: one `CountBadge` (18 px, critical, 9+, ring optional) — disc's warn/99+ and the shortcuts editor's warn are the decisions.

### Label → value row — 8 looks
| Where | Look |
|---|---|
| `documents/documents-screen-helpers.tsx:7` `Fact` | body 13.5, label wraps, value right, hairline between rows |
| `equipment/equipment-screen-helpers.tsx:10` `Fact` | same frame, label one line, value numeric, optional `›` + press |
| `customer/record/record-about.tsx:179` `Fact` | with action button, muted, chevron |
| `amazen/sheet-option.tsx` `ReceiptRow` | strong 16 / 13.5 receipt line |
| `people/members-screen-helpers.tsx` `Line` | caption 13.5, no hairline |
| `time/time-off-section-shared.tsx` `Line` | already a `ReceiptRow` wrapper ✓ |
| `calendar/event-sheet.tsx` `Row` | label fixed 70 px wide, value flex |
| `clock-out-sheet-shared.tsx` `Row` | muted/warn tone + flag |
Proposed: `FactRow` = the documents/equipment frame (they differ only in label wrap + numeric value).

### "Loading…" — left as they are
`documents/documents-screen.tsx:151` (onGlass, not centred); `chat/pick-people.tsx:71` and the two
issue sheets (part of a sentence/ternary); `settings/account-page.tsx:49` (a subtitle value).

### Empty states (icon + text) — differ
`app/(app)/overtime/[id].tsx:121` (48 px icon, textSecondary, back button);
`screens/app/route-planner-screen-your-route.tsx:140` (40 px, textMuted); team messages and
manage/attendance use amazen captions. Proposed: one `EmptyState {icon, text, action?}` on amazen.

### "Not allowed" — 1 variant left
`screens/app/asset-log-screen-helpers.tsx:156` — caption 12 px with 4 px top margin (the two merged
ones use 14 px). Proposed: the merged look.

### Monogram / initials circle — 10 looks
Sizes 36 (reminder-row), 42 (client-row), 58 (record-hero), `size` × 0.32 (person-avatar) vs × 0.36
(client-avatar, legacy `COLORS.primary` + white); companies get a rounded square (radius 11/13/18) in
three places; fills `c.tile` vs `c.accentTint`; crew-card's `ringInitials` (pinned by guards) and the tab
bar's `ProfileButton`. Proposed: `Monogram {name, size, company?, tone}` with one size→font ratio.

### Pill / chip buttons — 12 inline + 4 components
Inline: `worklog-sheet` (tile only), `time-history` / `invitations-screen` (same box, text 13 vs 12.5 and
one-line), `schedules-screen` (8 px vertical), `job-fields` (13 px horizontal), `jobs-controls` (segmented,
46 px high), step-form-sheet, job-checklist, onboarding pass-frame, register. Components: `FilterChip`
(legacy, 6 files), `FilterPill` (19), `ChoicePill` (6), `Chip` (7). Proposed: `ChoicePill` for on/off,
`Chip` for actions, retire `filter-chip.tsx`.

### Sheets — raw `<Modal>` ×8 (behaviour change, not done)
issue-thread-sheet, jobs-list/jobs-screen, location-picker-sheet, new-job/when-sheets, date-picker-modal,
time-picker-modal, LocationConsentModal, (customer)/(tabs)/profile. Moving them to `BlurSheet` changes
gestures and the one-slot queue — test stacked sheets on an iPhone first.

### Thread UIs — mockup only
Chat, support and shift issues each draw their own thread (bubbles, composer, attachments).

### Old style constants (`COLORS`/`SPACING`, 47 files) — none converted
The legacy constants are fixed hex values; amazen tokens change with light/dark, so no value is equal in
both themes. Converting a legacy screen (route planner, manage/attendance, asset-*, sign-document,
scan-card, customer tabs) is a visual change per screen.
