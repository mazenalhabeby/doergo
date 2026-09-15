#!/usr/bin/env bash
# A stand-in for `docker` that behaves like a small production box, for
# tools/release/deploy-sh.test.ts. State lives in $FAKE_STATE:
#   tags/<ref with / and : replaced>   → image id
#   containers/<name>                   → image id the container runs
#   calls.log                           → every invocation, one per line
# Knobs: FAKE_UNHEALTHY=<svc> (its NEW image never gets healthy)
#        FAKE_UP_FAIL=<svc>   (compose up of its NEW image fails)
#        FAKE_PULL_FAIL=1     FAKE_LIVE_TABLES=<n>   FAKE_IMAGE_MIGRATIONS=<n>
#        FAKE_MISSING_ENV=<VAR>
set -u
S="${FAKE_STATE:?}"
mkdir -p "$S/tags" "$S/containers"
echo "$*" >> "$S/calls.log"

key() { echo "$1" | tr '/:' '__'; }
tag_id() { cat "$S/tags/$(key "$1")" 2>/dev/null; }
svc_of_container() { echo "${1#hbcfield-}"; }
svc_of_ref() { local r="${1##*/hbcfield-}"; echo "${r%%:*}"; }

case "${1:-}" in
  info) echo "$S"; exit 0 ;;
  pull)
    ref="${*: -1}"
    [ "${FAKE_PULL_FAIL:-0}" = 1 ] && { echo "denied" >&2; exit 1; }
    echo "sha256:new-$(svc_of_ref "$ref")-0000000000000000" > "$S/tags/$(key "$ref")"
    exit 0 ;;
  tag)
    src="$2"; dst="$3"
    case "$src" in sha256:*) id="$src" ;; *) id="$(tag_id "$src")" ;; esac
    [ -n "$id" ] || exit 1
    echo "$id" > "$S/tags/$(key "$dst")"; exit 0 ;;
  image)
    # image inspect -f '{{.Id}}' <ref>
    id="$(tag_id "${*: -1}")"; [ -n "$id" ] || exit 1; echo "$id"; exit 0 ;;
  run)
    echo "${FAKE_IMAGE_MIGRATIONS:-2}"; exit 0 ;;
  logs)
    echo "Running database migrations (direct connection)..."
    echo "No pending migrations to apply."
    echo "Starting auth-service..."; exit 0 ;;
  ps) exit 0 ;;
  exec)
    shift
    c="$1"; shift
    all="$*"
    case "$c" in
      hbcfield-postgres)
        case "$all" in
          *pg_isready*) exit 0 ;;
          *pg_dump*) printf 'CREATE TABLE public.a (id text);\nCREATE TABLE public.b (id text);\n'; exit 0 ;;
          *pg_locks*) echo 0; exit 0 ;;
          *psql*) echo "${FAKE_LIVE_TABLES:-2}"; exit 0 ;;
        esac ;;
      hbcfield-redis) echo PONG; exit 0 ;;
      *)
        if [ -n "${FAKE_MISSING_ENV:-}" ] && [[ "$all" == *"\${${FAKE_MISSING_ENV}:-}"* ]]; then exit 1; fi
        exit 0 ;;
    esac
    exit 0 ;;
  inspect)
    fmt=""
    if [ "${2:-}" = "-f" ]; then fmt="$3"; name="$4"; else name="$2"; fi
    case "$name" in hbcfield-postgres|hbcfield-redis|hbcfield-pgbouncer)
      [ -z "$fmt" ] && exit 0; echo healthy; exit 0 ;;
    esac
    [ -f "$S/containers/$name" ] || { [ -z "$fmt" ] && exit 1; echo "missing"; exit 1; }
    image="$(cat "$S/containers/$name")"
    svc="$(svc_of_container "$name")"
    [ -z "$fmt" ] && exit 0
    health=healthy
    if [ "${FAKE_UNHEALTHY:-}" = "$svc" ] && [[ "$image" == sha256:new-* ]]; then health=unhealthy; fi
    case "$fmt" in
      *'.State.Health'*'RestartCount'*) echo "$health|true|0" ;;
      *'.State.Health'*) echo "$health" ;;
      '{{.RestartCount}}') echo 0 ;;
      '{{.Image}}') echo "$image" ;;
      '{{.Config.Image}}') echo "docker-$svc" ;;
      '{{.State.StartedAt}}') echo "2026-09-15T00:00:00Z" ;;
      '{{.State.Running}}') echo true ;;
      *) echo "?" ;;
    esac
    exit 0 ;;
  compose)
    shift
    while [ $# -gt 0 ] && [ "$1" != up ] && [ "$1" != config ]; do shift; done
    case "${1:-}" in
      config) exit 0 ;;
      up)
        svc="${*: -1}"
        ref="${HBCFIELD_REGISTRY}/hbcfield-${svc}:${HBCFIELD_TAG}"
        id="$(tag_id "$ref")"
        [ -n "$id" ] || { echo "no image $ref" >&2; exit 1; }
        if [ "${FAKE_UP_FAIL:-}" = "$svc" ] && [[ "$id" == sha256:new-* ]]; then exit 1; fi
        echo "$id" > "$S/containers/hbcfield-$svc"
        echo "UP $svc $id" >> "$S/ups.log"
        exit 0 ;;
    esac
    exit 0 ;;
esac
echo "fake docker: unhandled: $*" >&2
exit 3
