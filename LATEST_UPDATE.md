# Latest Update — 2026-03-24

## Production Docker Deployment

### Infrastructure (docker-compose.yml)
- Health checks on all 7 services (postgres, redis, auth, task, notification, tracking, gateway, web-app)
- Memory limits per container (256M–1G)
- Auto-migration entrypoint for auth-service (`prisma migrate deploy` on startup)
- Redis: `noeviction` policy (required by BullMQ)
- Nginx runs on host (not Docker) to coexist with other sites on the VPS

### Server Deployment (root@65.108.154.26)
- All 8 containers running healthy
- Host nginx with SSL (Let's Encrypt) + security headers
- APK download endpoint: `https://hbcfield.hbc-solution.io/downloads/hbcfield.apk`
- Download page: `https://hbcfield.hbc-solution.io/download`

### Mobile App (EAS Build)
- EAS build profiles: `development`, `preview`, `production`, `production-apk`
- Latest successful build: `01859c81-e31d-49aa-8abf-69b3786cd63e`
- APK artifact: `https://expo.dev/artifacts/eas/bUd15mTEbp8WiqUdUdG9N.apk`
- Icons updated from `01.png` logo (icon, adaptive-icon, splash, notification-icon, favicon)

### Files Changed
| File | Action |
|------|--------|
| `infra/docker/docker-compose.yml` | Hardened with health checks, memory limits, env vars |
| `infra/docker/scripts/auth-entrypoint.sh` | Created — auto-migration on deploy |
| `infra/docker/.env.production` | Cleaned up, added missing vars |
| `infra/docker/nginx/default.conf` | Created — reference nginx config |
| `infra/docker/nginx/ssl-init.sh` | Created — Let's Encrypt setup script |
| `infra/docker/deploy.sh` | Created — one-command deploy script |
| `apps/api/auth-service/Dockerfile` | Updated — uses entrypoint for migrations |
| `apps/mobile/eas.json` | Added build profiles |
| `apps/mobile/assets/*.png` | Replaced with HBCField logo icons |
| `apps/web-app/src/app/download/page.tsx` | Created — public APK download page |

### Pending
- Upload latest APK to server (`/opt/hbcfield/infra/docker/downloads/hbcfield.apk`)
- iOS build (Apple Developer account created, device registration needed)
