# HBCField ads — style & motion (approved 2026-09-29)

The user approved `money-vertical` v2 ("this is cool"). New ads reuse this recipe.

## The message rule
Sell the **company's outcome**, never the feature list. Pain first, then the turn, then gains in money and time.
Arc: **pain (red) → TIME = MONEY → HBCField gives you both back (blue) → 4 gains on real screens → LESS CHASING / MORE JOBS / MORE MONEY → offer.**
Each gain = one outcome sentence + one proof badge (`0 phone calls ✓`, `Payroll ready ✓`, `PAID ✓`).

## Look
- Canvas 1080×1920, 30 fps. Near-black `#05080f` with 3 drifting blurred blobs (120px blur, 0.55 opacity) + animated film grain (7%, overlay).
- **Colour carries the story**: blobs are red/rust/purple during the pain, cross-fade to blue/teal/indigo when HBCField arrives. White flash (0.55 → 0 in 0.25 s) on the turn and on the final slam.
- Accent `#2563eb` (brand) / `#60a5fa` on dark; green `#4ade80` / `#22c55e` = gain, done, money; red `#ff4d4d` / `#f87171` = loss.
- Font **Archivo** 900 for everything that must be read; 700–800 for labels.
- Real app footage sits in "windows": rounded 28px, 54px title bar with three dots, deep shadow, slight 3D `rotateY` that settles (−18° → −3°). Crop footage TIGHT so app text is ≥ 1:1 — a full desktop screen is unreadable on a phone.

## Motion
- Every entrance is a **spring** (`1 − e^(−7t)·cos(11t)`) — overshoot, never linear. Big words enter from scale 1.35–1.6 down to 1 ("slam") with a short shake.
- Numbers **count up** (ease-out cubic): money, hours.
- Map pin drops from −260px with a pulsing ring; chips/badges pop from scale 0.6 tilted −3°.
- Stamps (PAID ✓) land from scale 2.8 in 0.22 s.
- Scenes cross-fade 0.25 s; exits blur/fly sideways.

## Captions
Word-by-word, ALL CAPS, Archivo 900 90px, black 3px stroke, **one keyword per phrase on a blue pill** (red pill during the pain). Each word springs from 0.55. Captions are hidden when the scene's own big text already says it (pain cards, TIME = MONEY, the slam, end card).

## Safe zone (TikTok / Reels / Stories)
Everything that must be read inside **x 70–1010, y 270–1250**. Nothing important in the top 270px or below 1250px.

## Voice & sound
Narrator: ElevenLabs voice `GWparLcEBJuQc36gyF2J`, `eleven_multilingual_v2`, stability 0.30, similarity 0.75, **speed ~1.1 for ads**. Use `/with-timestamps` so captions follow real word timing.
Music: still to add (beat-driven, ~115–128 BPM for shorts).
⚠️ 2026-09-29: ElevenLabs refused with "failed or incomplete payment" — the v2 test used macOS `say` (Daniel) as a placeholder.

## Honesty notes
- "€2,340 lost to admin this month" is illustrative, not measured — keep it framed as dramatization or drop the figure.
- The PAID stamp sits on footage of a draft invoice.

## How it is built
`money-vertical/ad.html` is one page whose `render(t, frame)` sets every element from the time `t` — deterministic, so any frame can be rendered alone.
`render.mjs` (Playwright from `tools/video`) screenshots each frame and pipes to ffmpeg with `voice.wav`; `node render.mjs 12.5,20` renders stills only.
`timeline.json` = phrase start/end times; scenes are keyed to phrase indexes (`SC` in ad.html).
`extract-footage.sh` rebuilds `f/` from the demo-org captures in `tools/video/renders`.
Research and the storyboard: `storyboard.html` (also https://claude.ai/artifact/41QPRpFYiH1dXfwJVv1okK).

## v3 — real voice + music (2026-09-29)
- Voice: ElevenLabs narrator `GWparLcEBJuQc36gyF2J`, `eleven_multilingual_v2`, ONE continuous take via `/with-timestamps` (stability 0.42, similarity 0.8, style 0.3, speaker boost, speed 1.04, seed 1002). Continuous reads more human than per-sentence clips. Captions use the real per-word times (`wordStarts` in timeline.json).
- Breathing room: the take is cut only inside its own pauses and silence inserted after the benefit sentences (+0.25–0.6 s), so each benefit scene holds long enough.
- Music (Mixkit Stock Music Free License — ads/social allowed, no attribution; NOT for TV/radio; never register it with Content ID): A = "Rising Forest" (Diego Nava, assets.mixkit.co/music/471) — CHOSEN by the user, B = "Talent in the Air" (Diego Nava, /473). Both drop at 15.5 s of the track: start the track at `15.5 − turn` so the drop hits TIME = MONEY.
- Mix: music ×0.55, sidechain-ducked under the voice, 0.6 s fade in, 2.2 s fade out, loudnorm to −14 LUFS / −1.5 dBTP (social standard).
- ElevenLabs key lacks `music_generation` and `user_read`; TTS works.

## German version — `money-vertical-de/` (2026-09-29)
- Same narrator, voice and music ("Rising Forest"), formal "Sie". Take 1 of 2 (seed 2001). Pauses added after benefits: +0.2–0.4 s.
- German runs longer — sized for it: slam 98px, pain cards 41px nowrap, captions 80px, BEZAHLT stamp moved to (70, 940).
- Number formats: 2.340 €, 4.080,00 €, 38,5 h. Caption highlight matching keeps umlauts (`\p{L}`).
- The app footage in the windows is the ENGLISH app UI; a German capture would need the demo org re-filmed in German.
- To render: symlink or copy `f/` from `money-vertical/` (run its `extract-footage.sh`), then `node render.mjs`, then the music mix in the v3 notes.

## 16:9 — YouTube / LinkedIn / website (2026-09-30)
- NOT a new ad: `make-wide.py <vertical-dir> <wide-dir>` rewrites the vertical `ad.html` into 1920×1080. The 1080×1920 scene is wrapped in `#frame`, cropped to its readable band (y 220–1300) and slides: to the right (x 800) when captions speak, centred (x 420) when the scene carries its own big text; the opening counter drops 110px.
- Captions move to the left column (x 120, 720 wide, 96px / DE 84px), vertically centred, and shrink (to 60%) until they fit 620px — measured AFTER the words are filled, or a single still is measured empty.
- `mix-music.sh <dir> <out.mp4>` is the v3 music mix as a script (Rising Forest, drop on phrase 6, sidechain, −14 LUFS).
- Delivered: Desktop `HBCField-ad-wide-EN.mp4` (41.8 s), `HBCField-ad-wide-DE.mp4` (45.3 s).

## Series of 7 (2026-09-30) — `series/`
Same message rule, but each ad has its OWN look (the user rejected reusing the money ad's blobs/windows/captions): 01-proof evidence board, 02-shift split-flap board, 03-calls call pile-up → silence, 04-van top-down map, 05-licence cinematic countdown + rewind, 06-holiday falling blocks, 07-signal going underground. Mockup: https://claude.ai/artifact/Myzh8ApM9jL5Js8yBYdchw
- `series/<ad>/script.json` (phrases + pause after) → `./make-vo.py <ad>` (one ElevenLabs take, per-word times, pauses cut in; key from the repo-root `.env`). Max ~5 parallel requests or 429.
- `ad.html` defines render(t), `window.SFX=[{t,s,v,d}]` → `node ../render.mjs` (silent mp4 + sfx.json) → `./mix.py <ad> <music id> [start] [vol] [music enters at]`.
- Music + SFX are Mixkit (free licence) in `series/_audio` (m<id>.mp3 / s<id>.mp3): 653 Cinematic Jazz, 876 Like a Loop Machine, 1168 Coffee or Tea, 13 Summer Fun, 677 Epical Drums 02, 1142 Gummies, 126 Trap Electro Vibes.
- Never put real company names on screen (BILLA/Siemens were swapped for invented names).
- German + 16:9 (2026-09-30): each `<ad>-de/` holds its own script/voice/timeline (`"lang":"de"`) and a SYMLINK to `../<ad>/ad.html` — ONE page serves both languages (string table by `TL.lang`) and both formats (landscape layout when innerWidth > innerHeight). `W=1920 H=1080 node ../render.mjs` → `<dir>-wide-silent.mp4`; `WIDE=1 ./mix.py …`. Delivered to Desktop/HBCField-ads-series in 4 folders (28 files).

## 08-matchday — basketball club film (2026-10-11), 16:9 first
- 92 s explainer of the match-seats idea (mockup docs/design/match-seats). It is a full-idea film, so it is longer than the shorts.
- Look, following the 2026 trends: kinetic type (Archivo 900 slams on springs, pill keyword), liquid-glass panels (backdrop blur + gradient border), abstracted UI instead of footage, one hero object (a top-down hall seat map) that recurs and changes state. Colour still tells the story: red pain → blue turn → green finale.
- `series/08-matchday/ad.html` is 1920×1080 only (`W=1920 H=1080 node ../render.mjs`). Kinetic lines carry an explicit word index (5th field) so they land on the spoken word.
- Music: m677 Epical Drums 02, started at 36.6 s so its break and hit (track 56–58 s) land on "Meet match day" (`WIDE=1 ./mix.py 08-matchday 677 36.6 0.5 0`). Ends at −14.8 LUFS.
- Delivered: Desktop/HBCField-ads-series/HBCField-match-day-EN-16x9.mp4. Preview page: https://claude.ai/artifact/CMNfNtXJ1KzyFt86yUzuJr
- ⚠️ Elements placed with `tf()` (translate) must have CSS left/top 0. A CSS offset plus the translate pushed the phone, the mail, the ring and the gauge off-screen in the first cut.
