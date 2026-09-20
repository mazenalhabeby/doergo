# Scripts with nowhere to point a camera

A script in here is finished — all five languages, beats in order — and has no
capture flow, because the screen it describes does not exist yet or cannot be
reached. They live in their own folder so `video-guides.test.ts` keeps its rule
that **every script under `scripts/` has a registered flow**: that rule is what
stops a half-built video being forgotten in the pile, and it would have to be
weakened to hold these.

| Script | Why it cannot be filmed |
|---|---|
| `talking-to-your-client` | There is no way in. No chat control in the navbar, none on a member's page, none on a job. Cross-org chat is authorised by a SHARED space, and the recording organisation shares none. |

Video 02, "Your first five minutes", has no script here because it has no web
screen either: `/register` and `/signup` both 404, and signing up happens on
the phone.

Two others were in here and came out, which is the point of checking rather
than assuming:

* **`where-everyone-is`** was blocked on "there is no live map". True — but the
  road one member drove IS on the job, and it only needed GPS in the seed
  (`seedRoute`). Re-scoped and made.
* **`a-client-login`** was blocked on "the portal list does not open". Also
  true — clicking the card navigates nowhere — but the portal's own page exists
  at its own URL, so the seed gives the portal a fixed id and the flow visits
  it directly, exactly as it does the workspace settings.

Move one back to `scripts/` the day its screen exists, write the flow, and it
renders like any other.
