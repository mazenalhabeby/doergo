# Shot list — the web curriculum

Thirty-six web videos, in the order they teach. The numbering is both the watch
order and the build order, because a video that assumes something not yet
explained is the one people stop watching. Numbers in brackets are the position
in the full fifty-video curriculum, which also contains the mobile and portal
videos; the gaps here are those.

Each is about two minutes and assumes only the videos above it.

| # | id | Title | Status |
|--:|---|---|---|
| 01 | `what-hbcfield-is` | What HBCField is | **made** |
| 02 | `—` | Your first five minutes | ⚠️ **BLOCKED — there is no web signup page.** `/register` and `/signup` both 404; signing up happens on the phone. This belongs to the mobile set, or the web needs the page first. |
| 03 | `workspaces` | Workspaces, and why everything hangs off them | **made** |
| 04 | `who-sees-what` | Who sees what | **made** |
| 05 | `your-first-job` | Create your first job | **made** |
| 06 | `give-it-to-somebody` | Give it to somebody | **made** |
| 07 | `start-to-finish` | A job from start to finish | **made** |
| 08 | `job-types` | Job types, and flows that fit your trade | **made** |
| 09 | `work-that-repeats` | Work that repeats | **made** |
| 10 | `checklists-and-parts` | Checklists, sub-jobs and photos | **made** |
| 11 | `clock-in-and-out` | Clock in and clock out | **made** |
| 12 | `two-clocks` | Two clocks: worked and counted | **made** |
| 13 | `overtime` | Overtime, asked and approved | **made** |
| 14 | `the-rota` | The rota | **made** |
| 15 | `time-off` | Time off | **made** |
| 16 | `get-your-team-in` | Get your team in | **made** |
| 17 | `a-role-of-your-own` | Roles you can actually change | **made** |
| 18 | `a-members-file` | A member's file | **made** |
| 19 | `people-outside` | People who do not work for you | **made** |
| 20 | `your-first-client` | Your first client | **made** |
| 21 | `company-or-person` | A company, or a person | **made** |
| 22 | `keeping-a-client-warm` | Notes, calls and reminders | **made** |
| 23 | `job-at-their-address` | A job for a client, at their address | **made** |
| 24 | `equipment-on-the-books` | Put your equipment on the books | **made** |
| 25 | `who-has-the-van` | Who has the van | **made** |
| 26 | `your-first-invoice` | Your first invoice | **made** |
| 27 | `draft-issued-paid` | Draft, issued, sent, paid | **made** |
| 28 | `what-you-pay-us` | What you pay us | **made** |
| 29 | `the-filing-cabinet` | The filing cabinet | **made** |
| 30 | `contract-signed` | Issue a contract and get it signed | **made** |
| 31 | `licences-that-expire` | Licences that expire | **made** |
| 32 | `your-dashboard` | Your dashboard | **made** |
| 33 | `build-a-report` | Build a report | **made** |
| 34 | `where-everyone-is` | The road actually driven | **made** — re-scoped: there is no live map of everybody, and the road one member drove is the stronger half anyway |
| 35 | `a-client-login` | Give a client their own login | **made** |
| 36 | `—` | Talking to your client | ⚠️ **BLOCKED — there is no way in.** No chat control in the navbar, none on a member, none on a job. Cross-org chat is authorised by a SHARED space, and this organisation shares none. |

`create-a-job` exists on disk from an earlier pass and predates this ordering —
it straddles 05, 06 and 23. Re-scope it against them rather than treating it as
one of the thirty-six.

---

## Rules for every one of them

- **Never narrate a number the seed produces.** "Thirty-two hours" is wrong the
  next time the jitter changes. Say "her hours for the week".
- **Never narrate a status or module name** that an organisation can rename.
  Narrate the capability: "keeps track of vehicles", not the label on the switch.
- **Wait on selectors, never on time.** A `waitForTimeout` standing in for "the
  page is probably ready" passes here and fails on a cold dev server, mid-take.
- **`window.scrollBy` DOES NOTHING and fails silently.** The dashboard layout
  scrolls its own `flex-1 overflow-auto` pane, so the window never moves. Use
  the `scroller()` helper in `flows/what-hbcfield-is.ts`, or better, reveal a
  named panel by its own anchor — a scroll distance is a guess about a layout
  that changes, and when it is wrong the sentence plays over the wrong screen.
- **Warm the routes** the flow visits (`WARM_ROUTES` in `render.ts`, one entry
  per video) or the first visit to each spends its narration on a `next dev`
  compile, in silence.
- **Render with `say` first.** It is free and it proves the flow; switch to
  `VIDEO_TTS=elevenlabs` only for the take you mean to publish.
- **Check the frames before shipping.** `ffmpeg -ss <t> -i out.mp4 -frames:v 1`
  at each beat boundary is faster than watching, and catches a narration
  describing something that is not on screen — which is the single most common
  defect in these videos and the one nothing in the log reports.
- **If a video needs data the seed does not have, EXTEND THE SEED.** Never point
  a flow at another organisation. `seedOneJobInFull` exists because beat 10 of
  video 01 names a report, its hours, its parts and its signature.
- **Nothing real.** See `demo-data.ts`.
