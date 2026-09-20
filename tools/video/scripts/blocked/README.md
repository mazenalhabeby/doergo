# Scripts with nowhere to point a camera

A script in here is finished — all five languages, beats in order — and has no
capture flow, because the screen it describes does not exist yet or cannot be
reached. They live in their own folder so `video-guides.test.ts` keeps its rule
that **every script under `scripts/` has a registered flow**: that rule is what
stops a half-built video being forgotten in the pile, and it would have to be
weakened to hold these.

| Script | Why it cannot be filmed |
|---|---|
| `where-everyone-is` | No live map, and the seed records no GPS. The tracking tab on the attendance board is a table of who is clocked in. The first cut narrated "everybody who is out, on one map" over a list of clock-in times. |
| `a-client-login` | The portal list does not open. The seed makes a portal and the page lists it; clicking the card navigates nowhere, so who gets in, what they see and raising a request all have no screen. |
| `talking-to-your-client` | Cross-org chat is authorised by a SHARED space. Without one there is no chat control in the navbar at all. |

Video 02, "Your first five minutes", has no script here because it has no web
screen either: `/register` and `/signup` both 404, and signing up happens on
the phone.

Move one back to `scripts/` the day its screen exists, write the flow, and it
renders like any other.
