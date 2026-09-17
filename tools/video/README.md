# tools/video — product videos, rendered from code

Short narrated walkthroughs of real HBCField screens, for YouTube.

**One command:**

```bash
node tools/video/render.ts clock-in-out
```

That seeds a fictional demo organisation, narrates the script, drives the real
web app with Playwright, and assembles a 1080p mp4 with five subtitle tracks
and the YouTube text ready to paste. About **2½ minutes** end to end on an M-series
laptop; nothing to sync by hand.

## Why it is built this way

The product changes weekly and nobody has time to re-record a video by hand, so
a video has to be a **build artefact**: the input is a script and the app, and
the output is the file. Re-run it after a release and the video is current.

Nothing is AI-generated. Every frame is the real application, running against a
real database.

## Prerequisites

| Needs | Why |
|---|---|
| The dev stack up (`pnpm docker:dev`, `pnpm dev:api`, `pnpm dev:web`) | The flow drives the actual app at `localhost:3000` |
| `pnpm --filter @hbcfield/shared build` | The seed reads add-on keys, built-in roles and the default workflow from `dist/` |
| `ffmpeg` + `ffprobe` | Assembly. `brew install ffmpeg` |
| macOS | The default voice is the system `say`. See *Voices* below |
| `npx playwright install chromium` | Once, for the capture browser |

## The four steps, and why they are in this order

```
1. SEED     a fictional organisation            seed-video.ts
2. NARRATE  every beat, and MEASURE it          voice/
3. CAPTURE  the app, paced by the narration     capture/
4. ASSEMBLE cards + footage + voice + subtitles assemble/
```

**Step 2 before step 3 is the whole trick.** The narration is never stretched to
fit the picture, and the picture is never cut to fit the narration. Each beat is
spoken first, its length measured off the produced audio, and the capture then
holds that beat on screen for at least that long. Voice and picture cannot
drift, because the picture is paced by the voice while it is being recorded.

Change a sentence, or swap the voice, and the next run re-paces itself.

## Privacy — the part that is not optional

**The dev database contains real people.** Real customers, real staff, real
email addresses and phone numbers. These videos are published on YouTube, where
they are indexed and cannot be withdrawn from anybody's cache. One frame that
catches a real name is a disclosure that cannot be undone.

So recording never happens in an existing organisation. `seed-video.ts` builds
one that contains nobody — see `demo-data.ts` for the rules, all of which are
enforced by `video-guides.test.ts`:

- email domains end in **`.example`** (RFC 2606, permanently unregistrable)
- phone numbers come from **Ofcom's drama ranges** (`+44 7700 900xxx`,
  `+44 20 7946 0xxx`) — the only numbers in Europe a regulator permanently
  withholds from allocation
- invented street names, coordinates on open industrial land
- nothing copied from any existing seed

Two hard rails refuse to run otherwise: `assertLocalDatabase` rejects any
`DATABASE_URL` that is not local (and anything that smells of production, such
as `pgbouncer`), and `assertLocalWeb` refuses to point the browser anywhere but
localhost. Both throw rather than warn.

## Assembly: ffmpeg, and why not Remotion

**ffmpeg alone.** Remotion was the obvious candidate for the title and end
cards and was rejected deliberately: it would add a React renderer plus its own
headless Chromium — a second rendering stack, hundreds of megabytes — to draw
two static cards.

Meanwhile Playwright is *already* installed for capture, and it renders HTML at
exactly the recording viewport. So the cards are real HTML built from the
product's own design tokens, screenshotted once, and held on screen by ffmpeg's
`-loop 1`. One PNG per card instead of a frame loop, and the cards look like
HBCField rather than like a video editor's title preset.

**Subtitles are sidecar `.srt`, not burned in.** Burning captions bakes one
language into the pixels and would mean five renders of the same footage.
YouTube reads `.srt` natively and picks by viewer locale, so one video carries
all five languages and a wording fix is a text edit. (`--burn-in` produces a
local preview for checking timing; it is never what gets uploaded.)

## Voices

The default is macOS `say` — mediocre next to a paid neural voice, and free,
which is the trade. A video you can re-render for nothing every time the
product changes beats a better-sounding one nobody re-records.

```bash
VIDEO_SAY_VOICE=Daniel node tools/video/render.ts clock-in-out   # en_GB
VIDEO_SAY_RATE=150      node tools/video/render.ts clock-in-out   # slower
```

`voice/index.ts` is an adapter registry. **No paid provider is wired up and no
API key exists anywhere in this repo.** To add one: write
`voice/elevenlabs.ts` exporting a `VoiceAdapter`, have `isAvailable()` return
false when its key is unset, register it, and select it with `VIDEO_TTS=`.
Nothing else changes — the capture re-paces itself to the new durations.

## Flags

| Flag | What it does |
|---|---|
| `--skip-seed` | Reuse the organisation already in the database |
| `--skip-capture` | Reuse the last recording and timeline — for iterating on cards, audio or subtitles without re-driving the browser |
| `--burn-in` | Also write a preview with English captions burned in |
| `VIDEO_DEBUG=1` | Print the stack on failure |
| `VIDEO_THEME=light` | Record in light mode (the app's own default is dark) |

## Output

`renders/<script-id>/`:

| File | What it is |
|---|---|
| `<id>.mp4` | 1080p30 H.264 + AAC, ready to upload |
| `<id>.{en,de,es,fr,it}.srt` | One subtitle track per language |
| `<id>.youtube.txt` | Title, description, chapters and an upload checklist |
| `<id>.timeline.json` | What happened and when — the timing manifest |
| `work/`, `capture/`, `narration/` | Intermediates, not committed |

## What a human still has to do

The rig stops at the file. Per video, a person must:

1. **Watch it once.** The flow is deterministic but the app is not frozen; a
   redesigned screen can make a narration line wrong without breaking anything.
2. **Upload to YouTube** and attach the five `.srt` files.
3. **Paste** the description from `<id>.youtube.txt` (chapters come with it).
4. **Copy the video id** into `packages/shared/src/video-guides.ts` and set
   `seconds`. Until then `videoGuideFor()` returns undefined and the in-app
   link stays hidden.
5. **Check the translations.** The subtitle text in `scripts/*.json` was
   written, not machine-translated, but no native speaker has reviewed it.

## Adding a video

1. Write `scripts/<id>.json` — beats, narration in all five languages,
   `chapter` on the beats that deserve a YouTube chapter.
2. Write `capture/flows/<id>.ts` exporting a function that takes the narration
   durations and returns a `Timeline`. Use `openStage()`; wait on selectors,
   never on time.
3. Register it in `FLOWS` in `render.ts`.
4. Add the tour ids to `VIDEO_GUIDES`.
5. `node --test tools/video/video-guides.test.ts`

See `SHOTLIST.md` for the remaining tours and what each video should show.

## Mobile capture — not built

Out of scope here, and the slot it would fill is clear. **Maestro**
(`maestro record`) is the right tool: YAML flows, drives a real simulator or
device, and records video. It would slot in as `capture/mobile/<id>.yaml` plus
a runner that shells out to `maestro test`, emitting the same `Timeline` shape —
at which point narration, subtitles, cards and assembly are all reused
unchanged, because nothing downstream of capture knows what drew the pixels.

Two things make it more than an afternoon: Maestro has no equivalent of the
beat-pacing callback (the flow would need to hold each beat with explicit
waits generated from the narration durations), and the phone needs its own
seeded member plus a simulator with a mocked GPS fix.
