#!/usr/bin/env python3
"""
Layer 0 — the system comes back by itself after Redis restarts. LOCAL ONLY (restarts the local Redis container).

  python3 tools/layer0-redis-blip.py

Steady signed-in traffic; after 10 s `docker restart hbcfield-redis`; requests must succeed again within 20 s of
Redis being back. Before 2026-10-28 they never did: Nest's Redis transport without `retryAttempts` gives up on the
first dropped connection, and the gateway answered 500 until somebody restarted it.
"""
import json, os, re, subprocess, sys, threading, time, urllib.error, urllib.request

B = os.environ.get('API', 'http://localhost:4000/api/v1')
if not re.match(r'^http://(localhost|127\.0\.0\.1)(:\d+)?/', B):
    sys.exit('local only')


def call(method, path, token=None, body=None):
    h = {'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {})}
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body else None, headers=h)
    try:
        res = urllib.request.urlopen(req, timeout=10)
        return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception:
        return 0, b''


subprocess.run(['docker', 'exec', 'hbcfield-redis', 'sh', '-c', "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del"],
               capture_output=True)
s, out = call('POST', '/auth/login', body={'email': 'manager@example.com', 'password': 'password123'})
token = json.loads(out)['data']['accessToken']
# A route that goes through the gateway to a service over Redis (the gateway's own /health does not).
PATH = '/attendance/status'
assert call('GET', PATH, token)[0] == 200, 'the route answers before the test'

log, stop = [], threading.Event()
t0 = time.time()


def traffic():
    while not stop.is_set():
        log.append((time.time() - t0, call('GET', PATH, token)[0]))
        time.sleep(0.25)


th = threading.Thread(target=traffic)
th.start()
time.sleep(10)
print(f'[{time.time() - t0:5.1f}s] restarting Redis')
subprocess.run(['docker', 'restart', 'hbcfield-redis'], capture_output=True)
back = time.time() - t0
print(f'[{back:5.1f}s] Redis is back')
time.sleep(40)
stop.set()
th.join()

after = [(t, c) for t, c in log if t > back + 20]
first_ok = next((t for t, c in log if t > back and c == 200), None)
bad_after = [c for _, c in after if c != 200]
print(f'first success after Redis came back: {"never" if first_ok is None else f"{first_ok - back:.1f} s"}')
print(f'requests 20 s or more after Redis came back: {len(after)}, failed {len(bad_after)} {sorted(set(bad_after))}')
ok = first_ok is not None and not bad_after and len(after) > 10
print('PASS the system comes back by itself' if ok else 'FAIL the system did not come back by itself')
sys.exit(0 if ok else 1)
