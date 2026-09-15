#!/usr/bin/env bash
# A stand-in for `curl -s -o /dev/null -w '%{http_code}' … <url>` for deploy-sh.test.ts.
# FAKE_METRICS_CODE overrides the metrics answer (default 401 — token set).
url=""
for a in "$@"; do case "$a" in http://*|https://*) url="$a" ;; esac; done
echo "$url" >> "${FAKE_STATE:?}/curl.log"
case "$url" in
  */sync/metrics) printf '%s' "${FAKE_METRICS_CODE:-401}" ;;
  */auth/login)   printf '401' ;;
  *)              printf '200' ;;
esac
