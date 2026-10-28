#!/usr/bin/env python3
"""
How many API requests every phone screen sends — iOS simulator + dev build, LOCAL only.

  EXPO_PUBLIC_REQUEST_METER=1 npx expo start --dev-client   (in apps/mobile; its output to a file)
  python3 tools/phone-request-count.py <metro-log> <email> [--json out.json] [--no-sign-in] [--only /a,/b]

Signs in with Maestro (tools/maestro/chat/00-sign-in.yaml), then opens each screen ONCE, in order, by its deep link
(hbcfield://<path>) and counts the `[req]` lines the dev-only meter (apps/mobile/src/lib/api/request-meter.ts)
writes: within 1 s of the first, the total until quiet for 3 s (cap 15 s), and the same request twice.
"""
import json, os, subprocess, sys, time

args = sys.argv[1:]
LOG, EMAIL = args[0], args[1]
OUT = args[args.index('--json') + 1] if '--json' in args else None
HERE = os.path.dirname(os.path.abspath(__file__))
SCREENS = ['/', '/tasks', '/attendance', '/time-off', '/team', '/chat', '/calendar', '/more', '/manage', '/approvals',
           '/documents', '/equipment', '/my-assets', '/customers', '/client-requests', '/sync', '/support']
BUDGET = 8
if '--only' in args:
    SCREENS = args[args.index('--only') + 1].split(',')


def lines_from(offset):
    with open(LOG, 'rb') as f:
        f.seek(offset)
        chunk = f.read().decode('utf-8', 'replace')
    return [l.split('[req] ', 1)[1].strip() for l in chunk.splitlines() if '[req] ' in l]


def measure(path):
    start_off = os.path.getsize(LOG)
    subprocess.run(['xcrun', 'simctl', 'openurl', 'booted', f'hbcfield://{path.lstrip("/")}'], capture_output=True)
    seen, t0, quiet_since = [], time.time(), time.time()
    while time.time() - t0 < 15:
        time.sleep(0.2)
        now = lines_from(start_off)
        if len(now) > len(seen):
            for l in now[len(seen):]:
                seen.append((time.time(), l))
            quiet_since = time.time()
        elif time.time() - quiet_since > 3 and time.time() - t0 > 4:
            break
    first = seen[0][0] if seen else t0
    keys = [' '.join(l.split(' ')[:2]) for _, l in seen]
    dupes = sorted({k for k in keys if keys.count(k) > 1})
    return {'firstSecond': sum(1 for t, _ in seen if t - first <= 1.0), 'total': len(seen),
            'dupes': [f'{keys.count(k)}× {k}' for k in dupes], 'urls': [l for _, l in seen]}


if '--no-sign-in' not in args:
    env = {**os.environ, 'JAVA_HOME': os.environ.get('JAVA_HOME', '/opt/homebrew/opt/openjdk@17')}
    r = subprocess.run([os.path.expanduser('~/.maestro/bin/maestro'), 'test', '-e', f'EMAIL={EMAIL}',
                        os.path.join(HERE, 'maestro/chat/00-sign-in.yaml')], capture_output=True, text=True, env=env)
    if r.returncode != 0:
        sys.exit('sign-in failed:\n' + r.stdout[-1500:])
    time.sleep(8)

results = {}
for path in SCREENS:
    r = measure(path)  # a dev build holds the whole bundle: the first opening is the real one
    results[path] = r
    flag = ' ⚠' if r['firstSecond'] > BUDGET or r['dupes'] else ''
    print(f"{path:<18} 1s {r['firstSecond']:>2}  total {r['total']:>2}  dupes {len(r['dupes'])}{flag}"
          + (f"  {' | '.join(r['dupes'])}" if r['dupes'] else ''))
if OUT:
    json.dump({'email': EMAIL, 'budget': BUDGET, 'results': results}, open(OUT, 'w'), indent=2)
