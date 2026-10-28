#!/usr/bin/env python3
"""
Layer 0 — speed and load. LOCAL ONLY (dev servers in watch mode: slower than production builds).

  python3 tools/layer0-load.py              # sign-in time, signed-in overhead, 200 at once (~1 minute)
  python3 tools/layer0-load.py --soak 30    # + 30 minutes of steady load, each service's memory sampled

Targets: sign-in p95 < 400 ms · a signed-in request adds < 10 ms once its session is cached · 200 requests at the
same moment with 0 errors · memory grows < 10% over the soak (a leak shows now, not after a week).
"""
import json, os, re, statistics, subprocess, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

B = os.environ.get('API', 'http://localhost:4000/api/v1')
if not re.match(r'^http://(localhost|127\.0\.0\.1)(:\d+)?/', B):
    sys.exit('local only')
SOAK = int(sys.argv[sys.argv.index('--soak') + 1]) if '--soak' in sys.argv else 0
OK, BAD = [], []
PEOPLE = ['client@example.com', 'manager@example.com', 'mike@example.com', 'sarah@example.com', 'karim@example.com',
          'lisa@example.com', 'hassan@example.com', 'dana@example.com', 'david@example.com', 'noor@example.com']
LIGHT = ['/auth/me', '/chat/capabilities', '/approvals/count', '/attendance/status']


def check(label, cond, detail=''):
    (OK if cond else BAD).append(label)
    print(('PASS ' if cond else 'FAIL ') + label + ('' if cond else f'  → {detail}'))


def call(method, path, token=None, body=None, ip=None):
    h = {'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {}),
         **({'x-forwarded-for': ip} if ip else {})}
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body else None, headers=h)
    t0 = time.perf_counter()
    try:
        res = urllib.request.urlopen(req, timeout=30)
        out, s = res.read(), res.status
    except urllib.error.HTTPError as e:
        out, s = e.read(), e.code
    except Exception:
        out, s = b'', 0
    return s, out, (time.perf_counter() - t0) * 1000


def clear_throttle():
    subprocess.run(['docker', 'exec', 'hbcfield-redis', 'sh', '-c',
                    "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del"], capture_output=True)


def p(ms, q):
    ms = sorted(ms)
    return ms[min(len(ms) - 1, int(len(ms) * q))]


# ── sign-in ──
times, tokens = [], {}
for i in range(20):
    clear_throttle()
    who = PEOPLE[i % len(PEOPLE)]
    s, out, ms = call('POST', '/auth/login', body={'email': who, 'password': 'password123'})
    if s in (200, 201):
        times.append(ms)
        tokens[who] = json.loads(out)['data']['accessToken']
print(f'sign-in: median {statistics.median(times):.0f} ms · p95 {p(times, .95):.0f} ms over {len(times)}')
check('sign-in p95 under 400 ms', p(times, .95) < 400, f'{p(times, .95):.0f} ms')

# ── what a signed-in request adds, once its session is cached ──
tok = tokens['manager@example.com']
call('GET', '/chat/capabilities', tok)  # warm the cache
open_ms = [call('GET', '/health')[2] for _ in range(40)]
auth_ms = [call('GET', '/chat/capabilities', tok)[2] for _ in range(40)]
added = statistics.median(auth_ms) - statistics.median(open_ms)
print(f'open /health median {statistics.median(open_ms):.1f} ms · signed-in light read {statistics.median(auth_ms):.1f} ms')
check('a signed-in request adds under 10 ms (session from the cache)', added < 10, f'{added:.1f} ms')

# ── 200 at the same moment ──
clear_throttle()
jobs = [(tokens[PEOPLE[i % len(PEOPLE)]], LIGHT[(i // len(PEOPLE)) % len(LIGHT)], f'10.9.{i // 250}.{i % 250 + 1}')
        for i in range(200)]
barrier = threading.Barrier(200)


def one(job):
    barrier.wait()
    # Each from its own address, as 200 phones would be (locally the gateway trusts the forwarded address).
    return call('GET', job[1], job[0], ip=job[2]) + (job[1],)


with ThreadPoolExecutor(200) as ex:
    res = list(ex.map(one, jobs))
codes = [r[0] for r in res]
errors = [c for c in codes if c == 0 or c >= 500]
print(f'200 at once: median {statistics.median([r[2] for r in res]):.0f} ms · p95 {p([r[2] for r in res], .95):.0f} ms · '
      f'codes {sorted(set(codes))} · limited {codes.count(429)}')
for route in LIGHT:
    ms = [r[2] for r in res if r[3] == route]
    print(f'  {route}: median {statistics.median(ms):.0f} ms · max {max(ms):.0f} ms')
check('200 requests at the same moment: 0 errors', not errors, f'{len(errors)} errors {sorted(set(errors))}')

# ── soak ──
if SOAK:
    def rss():
        out = subprocess.run(['ps', '-axo', 'rss=,command='], capture_output=True, text=True).stdout
        by = {}
        for line in out.splitlines():
            m = re.match(r'\s*(\d+)\s+(.*)', line)
            if not m:
                continue
            for svc in ('gateway', 'auth-service', 'task-service', 'notification-service', 'tracking-service'):
                if f'apps/api/{svc}' in m.group(2) and 'node' in m.group(2) and 'dist/main' in m.group(2):
                    by[svc] = by.get(svc, 0) + int(m.group(1)) // 1024
        return by

    clear_throttle()
    start = rss()
    print(f'soak {SOAK} min · memory at start (MB): {start}')
    end_at, sent, failed, samples = time.time() + SOAK * 60, 0, 0, []
    i = 0
    while time.time() < end_at:
        tick = time.time()
        with ThreadPoolExecutor(10) as ex:
            batch = list(ex.map(lambda k: call('GET', LIGHT[k % len(LIGHT)], tokens[PEOPLE[k % len(PEOPLE)]]),
                                range(i, i + 20)))
        i += 20
        sent += len(batch)
        failed += sum(1 for r in batch if r[0] == 0 or r[0] >= 500)
        if int(tick) % 60 < 1:
            clear_throttle()
            samples.append(rss())
        time.sleep(max(0, 1 - (time.time() - tick)))
    end = rss()
    print(f'soak: {sent} requests, {failed} errors · memory at end (MB): {end}')
    check('soak: 0 errors', failed == 0, failed)
    for svc, mb in start.items():
        # Compare the settled middle against the end: the first minutes include warm-up (caches filling).
        mid = samples[len(samples) // 3].get(svc, mb) if samples else mb
        grown = (end.get(svc, mb) - mid) / mid * 100 if mid else 0
        check(f'soak: {svc} memory grows under 10% after warm-up ({mid} → {end.get(svc, mb)} MB, {grown:+.0f}%)', grown < 10)

print(f'\n{len(OK)} passed, {len(BAD)} failed')
sys.exit(1 if BAD else 0)
