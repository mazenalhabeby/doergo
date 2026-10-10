# Audit exceptions

`pnpm audit --audit-level=high` gates CI (`.github/workflows/ci.yml`, job `security`).
Advisories that cannot be fixed are listed in `package.json` → `pnpm.auditConfig.ignoreGhsas`,
**each one here with its reason**. An entry without a reason is a bug in this file.

Re-check every entry when Dependabot opens a PR touching the package, and at least quarterly:
`npm view <package> version` — if a fixed release exists, replace the ignore with an override.

| GHSA | Package | Why it is ignored | Where it runs |
|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm | braces ≤3.0.3 | No fixed release exists (3.0.3 is latest). Stack exhaustion on deeply nested glob patterns. | Metro file map / micromatch — build time, our own glob patterns |
| GHSA-86w9-cpqp-85rv | node-forge ≤1.4.0 | No fixed release exists (1.4.0 is latest; already force-pinned). PKCS#1 v1.5 signature edge case. | Expo CLI code-signing — build time; the apps never verify RSA signatures with it |
| GHSA-ch52-4w7c-c8xp | http-cache-semantics ≤4.2.0 | No fixed release exists. | Dev tooling only — not in any production dependency tree |
| GHSA-5p2g-fcmc-qvqq | image-size 1.2.1 | Fixed only in 2.x, whose API (buffer, not path) **breaks Metro** — `expo export` fails on every PNG. DoS via a crafted JXL/HEIF image. | Metro asset sizing — build time, our own assets |
| GHSA-w3rx-r6r6-pgpr | image-size 1.2.1 | Same as above (crafted ICNS). | Same |

Remaining **moderate** advisories (below the gate, not ignored, tracked here):
`uuid` 3.4.0 / 7.0.3 (Expo config-plugins → xcode; fix is a major), `sprintf-js` 1.0.3 (no fix),
`postcss-selector-parser` 6.1.4 (Tailwind 3; fix only in 7.x).

How "where it runs" was decided: every finding path from `pnpm audit --json` was followed from
the workspace that depends on it; a path through `devDependencies` never reaches a production image
(`Dockerfile`s install `--prod`).
