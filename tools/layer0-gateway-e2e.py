#!/usr/bin/env python3
"""
Layer 0 — the gateway's common layer, attacked over real HTTP. LOCAL ONLY (refuses any other host).

  python3 tools/layer0-gateway-e2e.py

  A. security headers on every answer; a foreign origin gets no CORS permission
  B. errors say nothing about the inside (no stack, no file path, no SQL, no service name)
  C. the internal "I called myself" header cannot be forged to skip the rate limit
  D. request size limits; odd methods and paths
  E. guard order: a request with a bad token is refused before any per-person limit or permission is read
"""
import json, os, re, secrets, subprocess, sys, urllib.error, urllib.request

B = os.environ.get('API', 'http://localhost:4000/api/v1')
if not re.match(r'^http://(localhost|127\.0\.0\.1)(:\d+)?/', B):
    sys.exit('local only')
ORIGIN = re.sub(r'/api/v1$', '', B)
OK, BAD = [], []


def check(label, cond, detail=''):
    (OK if cond else BAD).append(label)
    print(('PASS ' if cond else 'FAIL ') + label + ('' if cond else f'  → {str(detail)[:240]}'))


def call(method, path, token=None, body=None, headers=None, raw=None, base=B):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {'content-type': 'application/json', **(headers or {})}
    if token:
        h['authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + path, method=method, data=data, headers=h)
    try:
        res = urllib.request.urlopen(req)
        return res.status, res.read().decode('utf8', 'replace'), res.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf8', 'replace'), e.headers


def clear_throttle():
    subprocess.run(['docker', 'exec', 'hbcfield-redis', 'sh', '-c',
                    "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del"], capture_output=True)


clear_throttle()
s, body, _ = call('POST', '/auth/login', body={'email': 'manager@example.com', 'password': 'password123'})
TOKEN = json.loads(body)['data']['accessToken']
LEAK = re.compile(r'(at \w+ \(|/app/|/Users/|node_modules|\.ts:\d+|prisma\.|SELECT |INSERT |PrismaClient|ECONNREFUSED|'
                  r'task-service|auth-service|stack)', re.I)

print('\n— A. headers and CORS')
s, _, h = call('GET', '/health')
for name in ('x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security'):
    check(f'{name} is set', bool(h.get(name)), dict(h))
# CSP is switched off in development only (Swagger needs inline scripts) — production is checked from outside.
print('INFO content-security-policy here:', 'set' if h.get('content-security-policy') else 'off (development)')
check('x-powered-by is not sent', not h.get('x-powered-by'), h.get('x-powered-by'))
s, _, h = call('OPTIONS', '/auth/me', headers={'Origin': 'https://evil.example', 'Access-Control-Request-Method': 'GET'})
check('a foreign origin is not allowed (no Access-Control-Allow-Origin)',
      h.get('access-control-allow-origin') not in ('*', 'https://evil.example'), h.get('access-control-allow-origin'))
s, _, h = call('GET', '/auth/me', TOKEN, headers={'Origin': 'https://evil.example'})
check('…nor on a real request with a token', h.get('access-control-allow-origin') not in ('*', 'https://evil.example'),
      h.get('access-control-allow-origin'))

print('\n— B. errors reveal nothing')
cases = [
    ('broken JSON', 'POST', '/auth/login', None, b'{"email":'),
    ('a wrong type', 'POST', '/auth/login', None, json.dumps({'email': ['x'], 'password': {'$gt': ''}}).encode()),
    ('an unknown route', 'GET', '/no/such/route', TOKEN, None),
    ('a malformed id', 'GET', '/tasks/%27%20OR%201%3D1--', TOKEN, None),
    ('a path with traversal', 'GET', '/tasks/..%2F..%2Fetc%2Fpasswd', TOKEN, None),
    ('a huge page number', 'GET', '/tasks?page=999999999999&limit=-5', TOKEN, None),
    ('a NUL byte', 'GET', '/tasks?search=%00', TOKEN, None),
]
for label, m, p, t, raw in cases:
    s, text, _ = call(m, p, t, raw=raw)
    check(f'{label} → {s}, no stack/path/SQL/service in the answer', s < 500 and not LEAK.search(text), (s, text[:200]))

print('\n— C. the internal header cannot be forged')
clear_throttle()
forged = {'x-internal-dispatch': secrets.token_hex(32)}
codes = [call('POST', '/auth/login', body={'email': 'nobody@example.test', 'password': 'x' * 10}, headers=forged)[0]
         for _ in range(12)]
check('a forged x-internal-dispatch is still rate-limited (429 appears)', 429 in codes, codes)
clear_throttle()
codes = [call('GET', '/auth/me', TOKEN, headers={**forged, 'x-forwarded-for': f'10.0.{i}.{i}'})[0] for i in range(60)]
check('a signed-in burst with a forged header and rotating forwarded IPs is still limited per person', 429 in codes,
      sorted(set(codes)))
clear_throttle()

print('\n— D. sizes, methods, paths')
s, text, _ = call('POST', '/auth/login', raw=b'{"email":"' + b'a' * 12_000_000 + b'"}')
check(f'a 12 MB body is refused ({s})', s in (400, 413), (s, text[:120]))
s, _, _ = call('TRACE', '/health')
check(f'TRACE is not answered ({s})', s in (404, 405), s)
s, text, _ = call('GET', '/../../etc/passwd', base=ORIGIN)
check(f'traversal above the API prefix finds nothing ({s})', s in (400, 404) and 'root:' not in text, s)

print('\n— E. guard order')
clear_throttle()
codes = [call('GET', '/approvals', 'not-a-token')[0] for _ in range(40)]
check('a bad token is refused as 401 before any per-person limit or permission is read', set(codes) <= {401, 429} and 401 in codes,
      sorted(set(codes)))
clear_throttle()
s, body, _ = call('POST', '/auth/login', body={'email': 'sales@example.com', 'password': 'password123'})
worker = json.loads(body)['data']['accessToken']
for path in ('/organizations/members', '/approvals/rules', '/invoices', '/audit-logs'):
    s, _, _ = call('GET', path, worker)
    check(f'a worker without the right is refused {path} ({s})', s in (402, 403, 404), s)
clear_throttle()

print(f'\n{len(OK)} passed, {len(BAD)} failed')
sys.exit(1 if BAD else 0)
