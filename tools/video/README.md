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
| **Mobile only:** a running Android emulator + `maestro` + a JDK | The phone rig. `brew install openjdk`, `curl -fsSL https://get.maestro.mobile.dev \| bash` |
| **Mobile only:** the debug APK installed, and Metro running | `cd apps/mobile/android && ./gradlew assembleDebug` (needs **JDK 17** — newer JDKs are refused by Gradle) |

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

## Mobile capture

Built, and it films Android today: `node render.ts mobile-clock --skip-seed`.

The phone rig lives in `capture/mobile-runner.ts` and emits the same `Timeline`
as the browser rig, so narration, subtitles, cards, YouTube metadata and
assembly are all reused unchanged — nothing downstream of capture knows what
drew the pixels.

### What is different from the browser rig

The browser rig is **imperative**: Node runs each beat and holds the clock.
Maestro runs a whole flow in one process, so the phone rig is **declarative** —
Node writes one flow with the holds baked in, runs it once, and reads back when
each beat actually happened. One process because Maestro takes ~6.4 s to reach
its first command, and six seconds of a frozen phone between every beat cannot
be cut out of a recording that is still running.

Beat marks are still **observed, never computed**: each beat is fenced by a
labelled no-op and Node timestamps the line when Maestro prints it.

### Four traps, all of them load-bearing

- **Maestro has no sleep, and the obvious substitutes silently do not wait.**
  `extendedWaitUntil: notVisible:` on something that does not exist returns at
  once — a 5,000 ms timeout measured 1.5 s — and `waitForAnimationToEnd` returns
  as soon as the screen settles. Either would let the picture race the voice
  while looking exactly like a wait. The hold runs in Maestro's own JavaScript.
- **The developer menu opens on a freshly-installed app**, and clearing storage
  for a logged-out start makes every take look freshly installed. It is consumed
  by a throw-away warm-up launch, never from inside the flow: dismissing it there
  reloads the bundle, and Maestro's `backPress` then never returns.
- **Launch by explicit component**, not by URL. Any second app claiming
  `hbcfield://` turns the launch into an "Open with" chooser.
- **`localhost` is the emulator**, so Metro and the API are reached on the Mac's
  LAN address.

### iOS cannot be filmed in a simulator on Apple Silicon

Google's MLKit — the on-device reader behind the business-card and document
scanners — ships no arm64 **simulator** slice, only arm64 for devices and x86_64
for the old Intel simulators. That is why the Podfile carries
`EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`, which was right on an Intel Mac
and cannot work here, because iOS 26 simulators are arm64-only:

```
ld: building for 'iOS-simulator', but linking in object file
    (MLImage.framework/MLImage[arm64]) built for 'iOS'
```

`VIDEO_PHONE=ios` is implemented and needs a **real iPhone** over USB, or a
build with the OCR module stripped.

### Portrait footage

A phone recording is taller than the frame, so instead of two flat bars it is
laid over a blown-up, blurred, darkened copy of itself (`normaliseFootage`,
`{ phone: true }`).
