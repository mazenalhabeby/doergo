# Deep Security + Performance Test — 2026-10-10

## ▶ Status after the fixes (later on 2026-10-10)

**DEPLOYED to production 2026-10-10 ~21:52** — `84e169ba → c728bb59` (fast-forward), images
auth / task / gateway / web rebuilt from the lockfile, no migration, static synced, all
containers healthy, injected secrets intact. Rollback: git tag `prod-pre-secfix` → `84e169ba`,
images `hbcfield/hbcfield-{auth-service,task-service,api-gateway,web-app}:rollback-pre-secfix`,
DB backup `/opt/doergo/backups/pre-secfix_20261010_213905.sql.gz` (119 tables). No mobile change, so no OTA.
Two further changes were applied directly on the server (#4, #10).

| # | Finding | Status |
|---|---|---|
| 1 | Mail outage | ⏳ **Needs the owner**: a transactional mail provider account + API key → `SMTP_FALLBACK_*` in `.env.production` for auth-service **and** notification-service; ask MXroute to lift the block |
| 2 | TLS 1.0/1.1 accepted | ⏳ **Needs the owner**: Cloudflare → SSL/TLS → Edge Certificates → Minimum TLS **1.2** |
| 3 | Cloudflare bypass / `doergo.hbc-solution.io` | ⏳ **Needs the owner**: 301 or retire the old domain (prod nginx); Authenticated Origin Pulls for hbcfield/admin. Further production writes from the assistant were blocked by the permission classifier |
| 4 | Secrets world-readable | ✅ **Fixed on prod**: `.env.production` + `.env` → `600`; 21 backups moved to `/root/env-backups/doergo` (`700`/`600`), kept not deleted; compose still reads config |
| 5 | Kernel reboot pending | ⏳ **Needs the owner**: a window. A reboot also takes down 8bc.store, fire-protection.tech and ourmoda on the same host |
| 6 | CI audit gate always red | ✅ **Fixed** (`3fef387a`): 0 critical; the 5 unfixable highs ignored by GHSA with reasons (`docs/security/audit-exceptions.md`); Dependabot added. ⚠️ `image-size` 2.x **breaks Metro**, so it stays 1.2.1 |
| 7 | Cross-org 403 vs 404 | ✅ **Fixed** (`65582f9f` + `cf163e8a`): one shared `assertFoundInOrg` replaces ~50 hand-written copies (−481 lines). Six more oracles were found and closed: subtask parent, dependencies, service-report attachments ×2 (the "did you write it" check ran before the org check), creating in another org's workspace, cancelling (an admin could cancel another org's task they had once created). A guard test fails on any new hand-written copy. Verified live |
| 8 | Access token valid after logout | ✅ **Fixed** (`24632815`): sign-out revokes that token in Redis for its remaining life, read in the guard's existing `MGET`. Live: 200 → 401 |
| 9 | Home LCP 4.9 s | ❌ **Not a real finding**: 6 cold runs gave typical LCP 0.58–0.93 s; the 4.9 s was a one-off slow network run reported as typical. No code change |
| 10 | Minor ops | ✅ `security.txt` (`fb0de1a9`); ✅ SSH `X11Forwarding no` (prod drop-in, `sshd -t`, fresh login verified); ⏳ disk: the build-cache prune (~177 GB, entries older than 7 days) was blocked by the permission classifier, so the owner runs `docker builder prune -f --filter until=168h` |
| new | `deploy` user is in the `docker` group | ℹ️ That makes it root-equivalent. Keep its SSH key as guarded as root's, or drop it from the group |

**Re-verified after the fixes:**
- **Unit tests:** 9,214 passed, 0 failed — gateway 827 · auth 1,333 · task 2,076 · notification 227 · tracking 14 · web 1,864 · mobile 2,873.
- **Signed-in attack script:** 66/67 passed. The one miss reuses a refresh token inside the deliberate 60 s grace period; reuse after 65 s was confirmed as 401.
- **Builds:** web `build:check`; `expo export` for iOS and Android.
- **End-to-end:** all 9 suites rerun after the fixes, **0 failures**.

To ship: deploy auth/task/gateway/web images, as in the normal procedure. No migration.

---

> **Nothing has been changed.** The repo is clean; every fix was diagnosed, and some
> were tried locally and then reverted. Production is `84e169ba` (hbcfield.com,
> admin.hbcfield.com).
> Tests against production were read-only, apart from three short bursts of bad
> logins (15, 15 and 12 requests) to check the rate limiter. Tests that sign in were
> run against the **local** stack, so no real customer data was touched.
> This version replaces the first report, which had five errors (listed in §8).

## Verdict

The application itself is in **strong** shape:

- 9,207 unit tests and 351 end-to-end checks pass, with 0 failures.
- 65 signed-in attack tests found no data leaking between organizations and no
  way to raise one's own role.

The real risks sit **around** the application, in the server and network setup:

- Mail is down.
- Old TLS versions are accepted.
- The origin server can be reached without going through Cloudflare.
- Secret files can be read by other users on the server.
- A kernel reboot is pending.

| # | Finding | Severity | Who fixes it |
|---|---|---|---|
| 1 | Password reset broken — mail provider blocks the server IP, and there is no fallback | 🔴 High | Ops (needs a mail account) |
| 2 | TLS 1.0 / 1.1 accepted on both hosts | 🟠 Medium | Owner (Cloudflare setting) |
| 3 | Origin server reachable without Cloudflare; the old domain `doergo.hbc-solution.io` serves the full app | 🟠 Medium | Ops |
| 4 | `.env.production` and 21 backups of it can be read by any user on the server | 🟠 Medium | Ops |
| 5 | Kernel patches installed but not running: reboot pending, 274 days of uptime | 🟠 Medium | Ops (downtime window) |
| 6 | CI security gate fails on every run (findings with no fix keep it red) | 🟠 Medium | Code |
| 7 | Cross-org 403 vs 404 reveals whether a task or asset exists | 🟡 Low | Code |
| 8 | Access token still works for up to 15 minutes after logout | 🟡 Low | Code (accepted trade-off) |
| 9 | Home page LCP 4.9 s on desktop; login page ships 1.2 MB of JS | 🟡 Low | Code |
| 10 | Disk 84% full; no `security.txt`; SSH `X11Forwarding yes` | 🟡 Low | Ops |

---

## 1. Test coverage

| Layer | What ran | Result |
|---|---|---|
| Unit tests | jest in all 7 apps, the way CI runs it | ✅ **9,207 passed**, 0 failed, 14 skipped — gateway 822 · auth 1,333 · task 2,074 · notification 227 · tracking 14 · web 1,864 · mobile 2,873 |
| End-to-end (local, real HTTP) | all 9 `tools/*e2e*.py` + `clock-audit.py` | ✅ **351 checks, 0 failed** — role-tasks 43 · crew 51 · calendar 39 · companies 35 · contacts-import 25 · currency 28 · work-roles 82 · hours-basis 9 · clock-audit 39 |
| Signed-in attack tests (local) | 66 custom tests: cross-org access, role escalation, mass-assignment, external members, forged JWTs, injection, uploads, sessions, limiter | ✅ 65 passed. The one miss was the test's own assumption (refresh is cookie-based); re-run the cookie way, it passes |
| Production probes (unauthenticated) | headers, TLS, auth gates, exposed files, host header, redirects, CORS, origin bypass, ports, SSH | see §3 |
| Performance | iOS Release build on a simulator against production; real headless Chrome, desktop and throttled mobile | see §2 |

**Not covered:**
- A real phone: none was connected, so the simulator was used.
- Signed-in tests against **production**: the same tests ran locally against the same code.
- Load testing: deliberately not run against production.
- An independent third-party pentest.

---

## 2. Performance

### Mobile (iOS 17 Pro simulator, Release build, pointed at production)

| Metric | Result |
|---|---|
| Native build | ✅ succeeded, 0 errors |
| JS bundle | 9.6 MB, inside the app (no development server needed) |
| Process start | ~255 ms (262 / 251 / 255) |
| Sign In screen visible | within ~5 s — a screenshot after a fixed 5 s wait, **not** a measured first paint |

### Web (production, headless Chrome)

Mobile profile: 1.6 Mbps link, 150 ms latency, CPU slowed 4×.

| Profile | Page | TTFB | FCP | LCP | Load | CLS | JS (uncompressed) |
|---|---|---|---|---|---|---|---|
| desktop | `/` | 0.38 s | 0.86 s | **4.89 s** ⚠️ | 4.89 s | 0.015 | 2.3 MB |
| desktop | `/login` | 0.18 s | 0.62 s | 0.62 s | 0.60 s | 0 | 1.2 MB |
| desktop | `/pricing` | 0.27 s | 0.52 s | 0.52 s | 0.74 s | 0 | 1.3 MB |
| mobile (slow) | `/` | 0.37 s | 3.19 s | 3.19 s | 7.20 s | 0 | 2.3 MB |
| mobile (slow) | `/login` | 0.27 s | 3.24 s | 3.24 s | 3.16 s | 0.001 | 1.2 MB |
| mobile (slow) | `/pricing` | 0.21 s | 2.71 s | 2.71 s | 3.96 s | 0 | 1.3 MB |

- **Finding 9:** the desktop home-page LCP element is the logo image
  (`favicon.svg`) at 4.9 s. That is well above the 2.5 s "good" threshold, and is
  probably caused by the reveal animation holding the logo back. The login page
  ships 1.2 MB of uncompressed JS for one form.
- `intro.mp4` shows as aborted only because Playwright's Chromium has no H.264
  codec. It is not a site fault.

### Server

All 10 containers are healthy, both health endpoints answer 200, load average is 0.30.

---

## 3. Security results

### Passed

| Area | Result |
|---|---|
| HTTPS | 301 to HTTPS; HSTS `max-age=63072000; includeSubDomains; preload` on both hosts |
| Headers | CSP present (admin's is stricter: `frame-ancestors 'none'`, `base-uri 'none'`); nosniff, X-Frame, Referrer-Policy; no `X-Powered-By` |
| Anonymous access | every protected route returns 401; Swagger, Bull Board, `/metrics` and `/graphql` all 404 |
| Operator console | platform API is 404 on the main host and 401 on the admin host; the static-key support route is gone; an org admin's token is refused on every operator route |
| Cross-org access (local, as the **admin** of another org) | 24 attempts across tasks, comments, attachments, report, timeline, assignment, customers, assets, custody, invoices, documents, statements, member role and removal, employees, locations: **all refused, nothing returned** |
| Role escalation (as an employee) | members list, role change, billing, checkout, invitations, join code, settings, locations, companies, invoices, platform routes: all 403/401/404 |
| Mass-assignment | PATCHing role / org / permission fields onto oneself changes nothing |
| External members | assets, customers, asset categories, members, companies and clock-in: all 403 |
| Tokens | edited JWT payload → 401; `alg=none` → 401; refresh cookie is single-use (rotation, old one refused after the 60 s grace period) |
| Cookie | HttpOnly; `Secure` + `SameSite=strict` in production (code: `gateway/.../auth.controller.ts:30-32`) |
| Input | SQL- and NoSQL-style search strings, bad `limit`/`page` values, `<script>` → never a 500, no Prisma error text; list size capped at 200 |
| Uploads | `text/html`, `image/svg+xml`, `application/javascript`, `.exe` all refused (400) |
| Rate limits | per IP for anonymous requests (429 by the 3rd login); per user for signed-in requests (40 quick calls → 10 got 429); faking `CF-Connecting-IP` / `X-Forwarded-For` straight to the origin **does not** escape it |
| Enumeration | login and forgot-password answer the same for known and unknown emails |
| Exposed files | `.git`, `.env*`, `.DS_Store`, `package.json` and `*.js.map` all 404 |
| Other | spoofed `Host` → 403; no open redirect; TRACE 405; a foreign origin gets no CORS header; the admin host does not serve the marketing site |
| Clients | web access token in memory only (`web-app/src/lib/auth-session.ts:60`); phone tokens in SecureStore; no secrets or plain-`http` endpoints in the 9.6 MB phone bundle; iOS ATS `NSAllowsArbitraryLoads=false` |
| Server | only ports 22/80/443 reachable from outside; firewall drops by default; SSH key-only (passwords off); fail2ban active (~2,600 failed SSH attempts in 24 h, all refused); automatic security updates on, 0 pending |

### Findings in detail

**🔴 1 — Password reset broken (mail outage).**
- `POST /auth/forgot-password` returns 503. Both auth-service and
  notification-service log `554 Your IP is sending excessive rejected recipients`
  from `heracles.mxrouting.net`. A live SMTP greeting from the container still
  returns 554.
- **No fallback route exists in either service** (`SMTP_FALLBACK_HOST` is empty).
  The code already supports one (`packages/shared/src/mail/transport.ts`).
- **The IP is shared**: `hbc-engineering-app-1` on the same server also sends
  through `heracles.mxrouting.net`, so bounces from **either** app block both.
- Container logs start at the 19:16 restart, so the original bounces could not be
  traced. The production database holds 3 test-domain users
  (`example.test` ×2, `example.com` ×1). The same block happened on 2026-09-04.
- **Fix:**
  1. Add a transactional fallback provider (Resend / Brevo / Postmark) as
     `SMTP_FALLBACK_HOST/PORT/SECURE/USER/PASS/FROM` in `.env.production`, then
     recreate **both** auth-service and notification-service.
  2. Ask MXroute to lift the block.
  3. Give HBCField its own sending reputation: a provider's HTTPS API or its own IP,
     not the IP it shares with hbc-engineering.
  4. Remove the test addresses and stop sending to addresses that bounce.

**🟠 2 — TLS 1.0 / 1.1 accepted.**
- Confirmed with `openssl s_client -tls1/-tls1_1 -cipher DEFAULT:@SECLEVEL=0` and
  with Python: both hbcfield.com and admin.hbcfield.com negotiate TLSv1 and TLSv1.1.
- **Fix:** Cloudflare → SSL/TLS → Edge Certificates → Minimum TLS Version **1.2**
  (needs the Cloudflare login).

**🟠 3 — Cloudflare can be bypassed.**
- The origin `65.108.154.26` serves hbcfield.com when asked directly. Its address
  is public anyway, because 8bc.store, fire-protection.tech, hbc-solution.io and
  **`doergo.hbc-solution.io`** point straight at it.
- `doergo.hbc-solution.io` is an old name for this app. It proxies `/api/` → :4000
  and `/socket.io/` → :4001 and serves the full web app outside Cloudflare's
  WAF/DDoS protection.
- What does still apply there: security headers present, limiter works, platform
  API 404.
- **Fix:**
  - Redirect `doergo.hbc-solution.io` to hbcfield.com with a 301, or retire it.
  - Make the hbcfield/admin server blocks accept only Cloudflare: Authenticated
    Origin Pulls, or an allow-list of Cloudflare IPs in those blocks.
  - Do **not** firewall 443 for the whole host: the other sites are not behind
    Cloudflare and would break.

**🟠 4 — Secrets readable by any user on the host.**
- `/opt/doergo/infra/docker/.env.production` and **21** `.env.production.bak*`
  copies are `-rw-r--r--`, and the non-root shell user `deploy` exists.
- **Fix:** `chmod 600`; move the backups out of the tree or delete them; keep one
  dated copy in an encrypted backup.

**🟠 5 — Kernel reboot pending.**
- `/var/run/reboot-required` is present. The kernel is `6.8.0-71` and the server
  has been up 274 days, so installed kernel security fixes are not running.
- **Fix:** reboot during a maintenance window. All containers are `Up` with
  restart policies; check that afterwards.

**🟠 6 — CI security gate fails on every run.**
- `ci.yml` runs `pnpm audit --audit-level=high` across **all** dependencies. Today
  that reports **3 critical, 9 high, 13 moderate, 1 low**, and several of them have
  no fixed release, so the job can never turn green. A gate that is always red
  gets ignored, and then it stops catching new problems.
- The first report wrongly said CI dependency scanning was missing. It exists.
- **Fix:** apply the overrides in §4, then list the unfixable advisory IDs with
  their reasons in `pnpm.auditConfig.ignoreGhsas` so the gate is meaningful again.
  Add Dependabot for alerts.

**🟡 7 — Cross-org existence oracle.**
- As another organization's admin: `/tasks/:id` (plus `/comments`, `/attachments`,
  `/timeline`, DELETE) and `/assets/:id` answer **403** for a real ID and **404**
  for one that doesn't exist. Nothing is returned, and the IDs are CUIDs that
  can't be guessed, but the project's own rule (documents, job report) is to
  answer 404.
- **Fix:** answer 404 for records in another organization.

**🟡 8 — Logout leaves the access token valid** until it expires, at most 15 minutes
(`JWT_ACCESS_EXPIRATION=15m` in production). The refresh token is revoked. This is
the usual JWT trade-off; revoking instantly would need a check against
`tokensValidAfter` on each request.

**🟡 10 — Minor ops items.**
- Disk at 84% (47 GB free); prune images and backups.
- Add `/.well-known/security.txt`.
- `X11Forwarding yes` in sshd; set it to `no`.
- `script-src 'unsafe-inline'` is a documented Next.js trade-off
  (`next.config.ts:7`); removing it needs nonces.
- Android `allowBackup="true"` is mitigated by the SecureStore exclusion rules;
  store build 1.0.8 is still pending.

---

## 4. Dependencies — what actually ships

From `pnpm audit` across all workspaces, each vulnerable version was traced from
the app that depends on it.

| Package | Version | Severity | Ships in production? | Fix |
|---|---|---|---|---|
| handlebars | 4.7.8 | 3 critical, 4 high | **No** — `ts-jest` only (tests) | override to ≥4.7.10 |
| form-data | 4.0.5 | high | No — `supertest` (tests) | override to ≥4.0.6 |
| flatted | 3.4.1 | high | No — dev tooling | override to ≥3.4.2 |
| http-cache-semantics | 4.2.0 | high | No | **no fix released** |
| qs | 6.15.0 | 3 moderate | No — `supertest` (tests); production express uses **6.16.0, which is not affected** | override to ≥6.16.0 |
| deepmerge-ts | 7.1.5 | high | In images via the Prisma **CLI** config loader (runs only at `migrate deploy`, on trusted config) | ^8.0.2 |
| image-size | 1.2.1 | 2 high | Expo CLI / Metro (build) | ^2.0.4 |
| node-forge | 1.4.0 | high | Expo CLI code-signing (build) | **no fix released** |
| braces | 3.0.3 | high | Metro file map (build) | **no fix released** |
| fflate | 0.6.10 | moderate | **web client bundle** via `three-stdlib`; it only decompresses the site's own 3D assets | ^0.8.3 |
| decode-uri-component | 0.2.2 | moderate | Expo / react-navigation tooling | 0.5.0 |
| postcss-selector-parser | 6.1.4 | moderate | Tailwind (build) | needs a 6→7 major |
| sprintf-js | 1.0.3 | moderate | build tooling | **no fix released** |
| uuid | 3.4.0 / 7.0.3 | moderate | Expo config-plugins (build); production bullmq uses **11.1.1, which is fixed** | needs a major bump |
| ajv, yaml, @humanfs/node | — | moderate | No | overrides available |

**Conclusion:** no vulnerable version is reachable on the API servers with input
an attacker controls. The criticals are all test-only.

**Fix that was tried:** these overrides were applied locally:

```jsonc
"decode-uri-component@<0.5.0": "0.5.0",
"fflate@>=0.6.0 <0.6.11": "^0.8.3",
"deepmerge-ts@<8.0.0": "^8.0.2",
"image-size@>=1.2.0 <=2.0.2": "^2.0.4"
```

With them, `shared` and all 5 API services built clean. Not yet run with them:
`web-app build:check`, the mobile Metro bundle, and the test suites. Run those
before committing.

**Still to add** for the test-only ones: overrides for `handlebars`, `form-data`,
`flatted`, `qs`, `ajv`, `yaml` and `@humanfs/node`, then `ignoreGhsas` for the
packages with no fix. Do **not** add the `postcss-selector-parser@>=7.0.0 <7.1.6`
override from the first report: only 6.1.4 is installed, so it does nothing.

---

## 5. What needs the account owner

1. Cloudflare: Minimum TLS 1.2 (#2), Authenticated Origin Pulls (#3), and Cloudflare
   Access in front of `admin.hbcfield.com`.
2. A transactional mail provider account and API key (#1).
3. A reboot window (#5).
4. Every operator enrols 2FA at their next admin sign-in.
5. Move the blog publisher off the static key on hbcfield.com.
6. An independent pentest (HackerOne / Bugcrowd).

## 6. Suggested order for ops

1. Mail fallback (#1). Users are locked out of password reset now.
2. `chmod 600` and clear out the env backups (#4). Two minutes, no risk.
3. Minimum TLS 1.2 (#2), and a 301 or retirement for `doergo.hbc-solution.io` (#3).
4. Reboot (#5).
5. Dependency overrides plus `ignoreGhsas`, so the CI gate turns green (#6). Then
   the 404 consistency fix (#7) and LCP (#9).

## 7. How it was tested

- **Production:** `curl`, `openssl s_client`, Python `ssl`, `nc` port checks; SSH
  read-only (`docker logs/exec/ps`, `ss`, `ufw`, `sshd -T`, `nginx -T`, and
  `psql` SELECTs only).
- **Local:** Docker Postgres + Redis, the 5 services started from `dist/`, the
  custom 66-test script, `tools/*e2e*.py`, and jest in every app.
- **Performance:** `expo run:ios --configuration Release` on a simulator; a
  Playwright Chromium probe with CDP network and CPU throttling (a temporary file,
  deleted afterwards).
- **Dependencies:** `pnpm audit --json`, with each finding traced from its app to
  see whether it ships.

## 8. Corrections to the first report

- **"TLS 1.0/1.1 refused" was wrong.** The local client refused, not the server.
  Production accepts both (#2).
- **"CI dependency scanning missing" was wrong.** It exists and fails on every run (#6).
- **The production-only audit hid the criticals.** It showed 5 high / 5 moderate;
  the full audit is 3 critical / 9 high. The criticals are test-only.
- **The `postcss-selector-parser` override does nothing** and was listed as a fix.
- **"~5 s first paint" and "cold start works offline" were overstated.** It was a
  screenshot after a fixed wait, and offline behaviour was never tested.
- **The mail scope was incomplete.** notification-service and the shared IP with
  hbc-engineering were not checked the first time.
