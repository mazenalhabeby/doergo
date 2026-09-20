# Shot list — the web curriculum

Thirty-six web videos, in the order they teach. The numbering is both the watch
order and the build order, because a video that assumes something not yet
explained is the one people stop watching. Numbers in brackets are the position
in the full fifty-video curriculum, which also contains the mobile and portal
videos; the gaps here are those.

Each is about two minutes and assumes only the videos above it.

| # | id | Title | Status |
|--:|---|---|---|
| 01 | `what-hbcfield-is` | What HBCField is | **built** |
| 02 | | Your first five minutes | |
| 03 | | Workspaces, and why everything hangs off them | |
| 04 | | Who sees what | |
| 05 | | Create your first job | |
| 06 | | Give it to somebody | |
| 07 | | A job from start to finish | |
| 08 | | Job types, and flows that fit your trade | |
| 09 | | Work that repeats | |
| 10 | | Checklists, sub-jobs and photos | |
| 11 | | Clock in and clock out | |
| 12 [14] | | Two clocks: worked and counted | |
| 13 [15] | | Overtime, asked and approved | |
| 14 [16] | | The rota | ⚠️ needs a SHIFT workspace in the seed |
| 15 [17] | | Time off | |
| 16 [18] | | Get your team in | ⚠️ never film a live invitation code |
| 17 [19] | | Roles you can actually change | |
| 18 [20] | | A member's file | |
| 19 [21] | | People who do not work for you | |
| 20 [22] | | Your first client | |
| 21 [23] | | A company, or a person | |
| 22 [24] | | Notes, calls and reminders | |
| 23 [27] | | A job for a client, at their address | |
| 24 [28] | | Put your equipment on the books | |
| 25 [29] | | Who has the van | |
| 26 [32] | | Your first invoice | |
| 27 [33] | | Draft, issued, sent, paid | |
| 28 [34] | | What you pay us | |
| 29 [35] | | The filing cabinet | |
| 30 [36] | | Issue a contract and get it signed | |
| 31 [37] | | Licences that expire | |
| 32 [39] | | Your dashboard | |
| 33 [40] | | Build a report | |
| 34 [41] | | Where everyone is | |
| 35 [47] | | Give a client their own login | |
| 36 [50] | | Talking to your client | |

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
