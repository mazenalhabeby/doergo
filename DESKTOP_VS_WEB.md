# Desktop app or web? — the decision (18 Oct 2026)

**Question:** the phone works offline because it is an app. Should the web move to a desktop app so everything
works offline on desktop and phone, and stop using the web? Is desktop faster than web?

**Answer: keep the web. Make it work offline where it helps. A desktop app only as a thin wrapper, if customers ask.**

Mockup with Arabic narration: https://claude.ai/artifact/EoNsPqRWT4G5Has9HfX8Hp
(source: `docs/design/desktop-vs-web/`).

## Why

- **Not faster.** Electron and Tauri run the same web code inside a browser engine — screens render the same.
  Electron carries a whole Chrome (~200–300 MB idle); Tauri uses the system engine (~30–40 MB). Real speed comes
  from data and requests (tuned in the October audit), not the wrapper.
- **The web can work offline.** Linear works offline inside the browser: a local copy of the data, edits saved
  locally and sent when the connection returns — the same idea as our phone's offline engine. The hard browser
  limits (no background sync, storage cleared after days unused) are in iPhone Safari; our field workers use the
  native app.
- **Offline matters in the field, not the office.** Workers (clock, job steps, photos, signatures) are covered by the
  phone app. Managers and dispatchers need live data — live map, approvals, chat, team state. Field-service leaders
  (Salesforce Field Service, FieldPulse, FieldAware, Fieldbase) all do: offline-first phone app + web for the office.
- **Dropping the web loses** the client portal, signing links sent to customers, the operator console and office
  staff on shared/locked PCs. A desktop app also needs code signing (Apple $99/yr, Windows cert ~$200–700/yr), a
  ~2–3 week signing/update pipeline, and an install for every update — the web updates for everyone at once.
- **What leaders do:** Linear, Slack and Notion kept their websites; their desktop apps wrap the same web code.

## Plan (when we pick it up)

1. **Installable web app (PWA):** opens from the desktop with its own icon and window — no store, no signing cost.
2. **Offline where it helps:** read recent jobs, rota and timesheets offline (IndexedDB copy — the chat already has
   one); keep safe edits in a queue until the connection returns, reusing the phone engine's ideas.
3. **Only if customers ask:** a thin Tauri wrapper around the same web app, for tray, start-up and system
   notifications.

## Sources

- https://www.raftlabs.com/blog/tauri-vs-electron-pros-cons
- https://tech-insider.org/tauri-vs-electron-2026/
- https://magenest.com/en/pwa-vs-electron/
- https://edana.ch/en/2026/04/05/can-a-web-app-pwa-really-work-offline-like-a-native-app/
- https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- https://news.ycombinator.com/threads?id=jorde (Linear founder: offline works in the browser)
- https://slack.engineering/building-hybrid-applications-with-electron/
- https://www.fieldpulse.com/features/mobile-app
- https://forasoft.com/blog/article/publishing-desktop-apps-on-macos-290
- https://r-pkg.thecoatlessprofessor.com/shinyelectron/articles/code-signing.html
