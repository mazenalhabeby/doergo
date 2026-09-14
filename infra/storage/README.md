# Moving file storage to Cloudflare R2

Files are stored by **key** in the database, and links are signed when a file is
read, so moving provider is a copy plus a configuration change. The only rows
that hold URLs are public images (avatars, portal covers, organization logos),
which `rewrite-public-urls.cjs` updates.

Nothing here runs automatically. Every step is reversible until step 7.

## Why two buckets

R2 makes public access a property of the **whole bucket**: a custom domain
exposes every key in it. Site photos, receipts and payslips must never be
reachable that way, so:

| Bucket | Access | Holds |
|---|---|---|
| `hbcfield` | private, signed links only | task/report photos, work log, shift issues, receipts, proposals, documents, signatures |
| `hbcfield-public` | public via `files.hbcfield.com` | avatars, portal covers, organization logos |

## 0. Before you start

- The server release containing S0 (object store, `fileKey` columns, signed links) is deployed, and the migration `20260914120000_attachment_file_keys` has run.
- Web and the apps render photos through the API's signed `fileUrl`. Confirm a task photo opens on web and on a phone.
- Back up the database (`infra/scripts/backup-db.sh`) and assert the table count.

## 1. Create the buckets (Cloudflare dashboard → R2)

1. Create `hbcfield` with **Jurisdiction: European Union**. Public access: **off**.
2. Create `hbcfield-public` with **Jurisdiction: European Union**. Connect the custom domain `files.hbcfield.com`.
3. On both, set CORS from `infra/storage/cors.json`.
4. On `hbcfield`, add a lifecycle rule: abort incomplete multipart uploads after 1 day.
5. Create an **R2 API token** scoped to these two buckets only, with *Object Read & Write*. Note the access key, the secret and the account endpoint `https://<account>.eu.r2.cloudflarestorage.com`.

## 2. Copy

```bash
# rclone remotes: hetzner (current) and r2 (new)
rclone config create hetzner s3 provider=Other endpoint=https://hel1.your-objectstorage.com access_key_id=… secret_access_key=…
rclone config create r2 s3 provider=Cloudflare endpoint=https://<account>.eu.r2.cloudflarestorage.com access_key_id=… secret_access_key=…

# Everything private
rclone copy hetzner:hbcfield r2:hbcfield --transfers 16 --checksum --progress \
  --exclude "avatars/**" --exclude "portals/**"

# Public images into the public bucket (same keys)
rclone copy hetzner:hbcfield/avatars r2:hbcfield-public/avatars --checksum --progress
rclone copy hetzner:hbcfield/portals r2:hbcfield-public/portals --checksum --progress
```

## 3. Verify against R2 (before switching)

```bash
docker cp infra/storage/verify-storage.cjs hbcfield-auth-service:/tmp/
docker exec \
  -e S3_ENDPOINT=https://<account>.eu.r2.cloudflarestorage.com -e S3_REGION=auto \
  -e S3_BUCKET=hbcfield -e S3_PUBLIC_BUCKET=hbcfield-public \
  -e S3_PUBLIC_BASE_URL=https://files.hbcfield.com \
  -e S3_ACCESS_KEY=… -e S3_SECRET_KEY=… \
  -e LEGACY_BASES=https://hel1.your-objectstorage.com/hbcfield \
  hbcfield-auth-service node /tmp/verify-storage.cjs
```

It must end with **✓ Every stored file is present.** Anything missing is listed.
Re-run `rclone copy` (it only copies what is missing), then verify again.

## 4. Switch

In `/opt/doergo/infra/docker/.env.production`:

```
S3_ENDPOINT=https://<account>.eu.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=hbcfield
S3_PUBLIC_BUCKET=hbcfield-public
S3_PUBLIC_BASE_URL=https://files.hbcfield.com
S3_LEGACY_BASE_URLS=https://hel1.your-objectstorage.com/hbcfield
S3_OBJECT_ACL=false
S3_ACCESS_KEY=…
S3_SECRET_KEY=…
```

Recreate the three containers that use storage, one at a time:

```bash
docker compose --env-file .env.production up -d --no-deps api-gateway auth-service task-service
```

Uploads made in the minutes between step 2 and step 4 are still on Hetzner: run
`rclone copy` once more right after the switch.

## 5. Rewrite public image URLs

```bash
docker cp infra/storage/rewrite-public-urls.cjs hbcfield-auth-service:/tmp/
docker exec hbcfield-auth-service node /tmp/rewrite-public-urls.cjs \
  --from https://hel1.your-objectstorage.com/hbcfield --to https://files.hbcfield.com   # dry run
docker exec hbcfield-auth-service node /tmp/rewrite-public-urls.cjs \
  --from https://hel1.your-objectstorage.com/hbcfield --to https://files.hbcfield.com --apply
```

## 6. Check in the product

- Upload a task photo on web and on a phone; open it.
- Complete a job with a before/after photo; download the report PDF.
- Open a payslip or document; sign one.
- Change an avatar; it shows on the navbar and the team page.
- Run `verify-storage.cjs` once more with the live settings.

## Roll back (until step 7)

Restore the Hetzner values in `.env.production`, recreate the three containers,
and run `rewrite-public-urls.cjs --from https://files.hbcfield.com --to https://hel1.your-objectstorage.com/hbcfield --apply`.
Files uploaded to R2 in between must be copied back with `rclone copy r2:… hetzner:…`.

## 7. After 30 days

- Make the Hetzner bucket read-only, then delete it.
- Remove `S3_LEGACY_BASE_URLS` only once `fileUrl` columns have been dropped (they still hold Hetzner URLs for app 1.0.5).

## Known before the move

- Some avatars in production are `/uploads/...` files on the gateway's disk from before storage was configured. `verify-storage.cjs` lists how many. They keep working from the gateway volume and are not moved by this runbook.
- The gateway only receives storage settings since this change. The first deploy moves new avatar uploads from its disk to the bucket; check an avatar upload right after that deploy (Hetzner must accept `public-read` object ACLs).
