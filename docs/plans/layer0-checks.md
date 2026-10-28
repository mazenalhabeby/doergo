# Layer 0 — the foundation: what locks it

`pnpm layer0:check` (tools/layer0-check.sh) runs everything that can run locally: a fresh database against the
schema (with the reviewed SQL-only list in `tools/layer0-known-drift.txt`), the size/structure ratchets, the
foundation's unit tests, and three live scripts — `layer0-auth-e2e.py` (sign-in and sessions attacked),
`layer0-gateway-e2e.py` (the gateway's common layer attacked), `layer0-load.py` (speed, 200 at once; `--soak 30`).

## Production — run by hand, read-only (first run 2026-10-28)

| Check | How | Pass |
|---|---|---|
| TLS | `openssl s_client -tls1` / `-tls1_1` with `-cipher DEFAULT:@SECLEVEL=0` on hbcfield.com and admin.hbcfield.com | alert 70 (refused); 1.2 and 1.3 answer |
| Headers / CORS | `curl -sI https://hbcfield.com/api/v1/health`, an `Origin: https://evil.example` request | CSP, HSTS, nosniff, frame options; no Access-Control-Allow-Origin for a foreign origin |
| Ports | `nc -z` on 3000/4000/4001/5432/6379/6432 | closed (only 22/80/443) |
| SSH | `ssh -o PubkeyAuthentication=no …` | `Permission denied (publickey)` |
| Old domain | `curl https://doergo.hbc-solution.io/` | 308 → hbcfield.com |
| Around Cloudflare | `curl --resolve hbcfield.com:443:<origin-ip> https://hbcfield.com/api/v1/health` | should be refused — ⚠️ 200 on 2026-10-28 (open) |
| Backups | `/var/log/hbcfield-backup.log` | today's `OK dump` + `OK upload` |
| Restore | `infra/scripts/verify-restore.sh` on the server (no argument = a fresh backup) | RESTORE VERIFIED |
| Secrets | `stat -c %a infra/docker/.env*` | 600 root |
| Lockfile | a package version inside the running image = `pnpm-lock.yaml` | equal |
