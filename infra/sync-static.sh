#!/usr/bin/env bash
#
# Publish the web app's immutable build assets to a host directory so nginx can
# serve them with sendfile, instead of proxying every script, font and video
# through Node.
#
# Run after EVERY web-app deploy. Forgetting is not fatal: the nginx locations
# fall back to the Node upstream via `try_files ... @nextjs`, so a stale or
# missing copy costs the optimisation and nothing else.
#
# Old build hashes are deliberately NOT deleted. A browser that loaded the page
# seconds before a deploy still asks for the previous chunk names; removing them
# in lockstep with the deploy is how a rolling update turns into a wall of 404s.
# They are pruned by age instead, far outside any session's lifetime.
set -euo pipefail

CONTAINER=hbcfield-web-app
DEST=/opt/doergo/static
APP=/app/apps/web-app

command -v docker >/dev/null || { echo "docker not found" >&2; exit 1; }
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || { echo "$CONTAINER is not running" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# .next/static — content-hashed, so copying over the top is always safe.
docker cp "$CONTAINER:$APP/.next/static/." "$tmp/next-static/"
mkdir -p "$DEST/_next/static"
cp -a "$tmp/next-static/." "$DEST/_next/static/"

# public/ — everything except downloads/, which is 212MB of APKs that nginx
# already serves from its own host alias and Node has never been asked for.
docker cp "$CONTAINER:$APP/public/." "$tmp/public/"
rm -rf "$tmp/public/downloads"
mkdir -p "$DEST/public"
cp -a "$tmp/public/." "$DEST/public/"

chown -R www-data:www-data "$DEST"
# Prune by ctime, NOT mtime. `cp -a` preserves the original modification time,
# and a build asset can legitimately be months old — intro.mp4 has not changed
# since July. An mtime prune therefore deletes the files it has just copied, on
# the very first run. ctime is stamped at copy, so a file re-synced by this
# script never ages out and only genuinely stale hashes do.
find "$DEST" -type f -ctime +30 -delete 2>/dev/null || true
find "$DEST" -type d -empty -delete 2>/dev/null || true

echo "synced: $(find "$DEST/_next/static" -type f | wc -l) build files, $(du -sh "$DEST" | cut -f1) total"
