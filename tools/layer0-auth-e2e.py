#!/usr/bin/env python3
"""
Layer 0 — sign-in and sessions, attacked over real HTTP. LOCAL ONLY (refuses any other host).

  python3 tools/layer0-auth-e2e.py            # ~3 minutes (two deliberate waits: the refresh grace, the auth cache)
  python3 tools/layer0-auth-e2e.py --quick    # skips the two waits

What it proves:
  A. the three session builders (sign-in, refresh, every request) give the same session, for several kinds of member
  B. a token that is tampered, unsigned, expired, signed elsewhere or signed-out is refused
  C. a refresh token is single-use (after the grace period), and sign-out ends it
  D. five wrong passwords lock the account; a burst of sign-ins is throttled
  E. a password-reset link works once, and never after it expired
  F. a suspended organization is refused at all three doors
  G. the browser's refresh cookie is httpOnly and never in the body; no token is written to the log

Uses the demo accounts and the throwaway one-person org `e2e-solo-owner@example.test`; puts back what it changes.
"""
import base64, hashlib, hmac, json, os, re, secrets, subprocess, sys, time, urllib.error, urllib.request

B = os.environ.get('API', 'http://localhost:4000/api/v1')
if not re.match(r'^http://(localhost|127\.0\.0\.1)(:\d+)?/', B):
    sys.exit('local only')
QUICK = '--quick' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOLO, SOLO_PW = 'e2e-solo-owner@example.test', 'E2eSolo2026'
LOG = os.environ.get('API_LOG')  # optional: the dev API's log file, scanned for tokens


def env(path, key):
    for line in open(os.path.join(ROOT, path)):
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip().strip('"')
    raise SystemExit(f'{key} not in {path}')


SECRET = env('apps/api/auth-service/.env', 'JWT_ACCESS_SECRET')


def call(method, path, token=None, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {'content-type': 'application/json', **(headers or {})}
    if token:
        h['authorization'] = 'Bearer ' + token
    req = urllib.request.Request(B + path, method=method, data=data, headers=h)
    try:
        res = urllib.request.urlopen(req)
        return res.status, json.loads(res.read() or b'{}'), res.headers
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}'), e.headers
        except Exception:
            return e.code, {}, e.headers


def sql(q):
    return subprocess.check_output(
        ['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-tAc', q]).decode().strip()


def clear_throttle():
    subprocess.run(['docker', 'exec', 'hbcfield-redis', 'sh', '-c',
                    "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del"], capture_output=True)


OK, BAD = [], []


def check(label, cond, detail=''):
    (OK if cond else BAD).append(label)
    print(('PASS ' if cond else 'FAIL ') + label + ('' if cond else f'  → {str(detail)[:240]}'))


def login(email, pw='password123', **extra):
    clear_throttle()
    s, b, h = call('POST', '/auth/login', body={'email': email, 'password': pw, **extra})
    assert s in (200, 201), (email, s, b)
    return b['data'], h


def b64(d):
    return base64.urlsafe_b64encode(json.dumps(d, separators=(',', ':')).encode()).rstrip(b'=').decode()


def payload(tok):
    p = tok.split('.')[1]
    return json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4)))


def sign(claims, secret=SECRET, alg='HS256'):
    head = b64({'alg': alg, 'typ': 'JWT'})
    body = b64(claims)
    if alg == 'none':
        return f'{head}.{body}.'
    mac = hmac.new(secret.encode(), f'{head}.{body}'.encode(), hashlib.sha256).digest()
    return f'{head}.{body}.' + base64.urlsafe_b64encode(mac).rstrip(b'=').decode()


# ── A. one session, three builders ────────────────────────────────────────────────────────────
print('\n— A. the three session builders agree')
KEYS_SKIP = {'avatarUrl'}  # signed URLs may differ per call
missing_on_refresh = set()
for who in ('client@example.com', 'manager@example.com', 'mike@example.com', 'sales@example.com',
            'klaus.huber@weingaertner.example'):
    d, _ = login(who)
    s, r, _ = call('POST', '/auth/refresh', body={'refreshToken': d['refreshToken']})
    s2, m, _ = call('GET', '/auth/me', d['accessToken'])
    if s not in (200, 201) or s2 != 200:
        check(f'{who}: refresh and /me answer', False, (s, s2))
        continue
    a, b, c = d['user'], r['data']['user'], m['data']
    shared = (set(a) & set(b) & set(c)) - KEYS_SKIP
    diff = {k: (a[k], b[k], c[k]) for k in shared if not (a[k] == b[k] == c[k])}
    check(f'{who}: every field the three share is equal ({len(shared)} fields)', not diff, diff)
    missing_on_refresh |= set(a) - set(b)
print('INFO fields sign-in gives that refresh does not:', sorted(missing_on_refresh) or 'none')

# ── B. forged tokens ──────────────────────────────────────────────────────────────────────────
print('\n— B. forged tokens')
d, _ = login('manager@example.com')
good = d['accessToken']
claims = payload(good)
check('a real token works', call('GET', '/auth/me', good)[0] == 200)
head, body, sig = good.split('.')
flipped = sig[:-2] + ('A' if sig[-2] != 'A' else 'B') + sig[-1]
check('a changed signature → 401', call('GET', '/auth/me', f'{head}.{body}.{flipped}')[0] == 401)
check('a raised role in the body (same signature) → 401',
      call('GET', '/auth/me', f"{head}.{b64({**claims, 'role': 'ADMIN'})}.{sig}")[0] == 401)
check('alg: none → 401', call('GET', '/auth/me', sign({**claims, 'role': 'ADMIN'}, alg='none'))[0] == 401)
check('signed with another secret → 401', call('GET', '/auth/me', sign(claims, secret='not-the-secret'))[0] == 401)
check('expired (a real signature) → 401',
      call('GET', '/auth/me', sign({**claims, 'iat': int(time.time()) - 7200, 'exp': int(time.time()) - 3600}))[0] == 401)
check('a stranger with a valid signature and an unknown user → 401',
      call('GET', '/auth/me', sign({**claims, 'sub': 'no-such-user', 'jti': secrets.token_hex(8)}))[0] in (401, 403))
check('no token → 401', call('GET', '/auth/me')[0] == 401)
check('garbage → 401', call('GET', '/auth/me', 'garbage')[0] == 401)

# ── C. refresh tokens and sign-out ────────────────────────────────────────────────────────────
print('\n— C. refresh tokens and sign-out')
d, _ = login('manager@example.com')
s, r1, _ = call('POST', '/auth/refresh', body={'refreshToken': d['refreshToken']})
check('a refresh token works once', s in (200, 201), s)
new_refresh = r1.get('data', {}).get('refreshToken')
s, _, _ = call('POST', '/auth/refresh', body={'refreshToken': d['refreshToken']})
print(f'INFO the same token again inside the grace period → {s} (allowed on purpose: two tabs refreshing at once)')
if not QUICK:
    print('… waiting 65 s for the grace period to end')
    time.sleep(65)
    s, _, _ = call('POST', '/auth/refresh', body={'refreshToken': d['refreshToken']})
    check('the same token after the grace period → 401', s == 401, s)
    s, _, _ = call('POST', '/auth/refresh', body={'refreshToken': new_refresh})
    print(f'INFO the token it was exchanged for, after the replay → {s}')
check('a made-up refresh token → 401', call('POST', '/auth/refresh', body={'refreshToken': secrets.token_hex(32)})[0] == 401)
d, _ = login('manager@example.com')
s, _, _ = call('POST', '/auth/logout', d['accessToken'], body={'refreshToken': d['refreshToken']})
check('sign-out answers', s in (200, 201, 204), s)
check('the access token after sign-out → 401', call('GET', '/auth/me', d['accessToken'])[0] == 401)
check('the refresh token after sign-out → 401',
      call('POST', '/auth/refresh', body={'refreshToken': d['refreshToken']})[0] == 401)

# ── D. wrong passwords and bursts ─────────────────────────────────────────────────────────────
print('\n— D. wrong passwords and bursts')
sql(f"update users set \"failedLoginAttempts\"=0, \"lockedUntil\"=null where email='{SOLO}'")
codes = []
for _ in range(5):
    clear_throttle()
    codes.append(call('POST', '/auth/login', body={'email': SOLO, 'password': 'wrong-' + secrets.token_hex(3)})[0])
clear_throttle()
s, b, _ = call('POST', '/auth/login', body={'email': SOLO, 'password': SOLO_PW})
check('five wrong passwords lock the account (the right one is refused next)', s in (401, 403, 423, 429), (codes, s))
locked = sql(f"select \"lockedUntil\" > now() + interval '14 minutes' from users where email='{SOLO}'")
check('…for 15 minutes', locked == 't', locked)
sql(f"update users set \"failedLoginAttempts\"=0, \"lockedUntil\"=null where email='{SOLO}'")
clear_throttle()
s1, b1, _ = call('POST', '/auth/login', body={'email': 'nobody-' + secrets.token_hex(3) + '@example.test', 'password': 'x' * 10})
s2, b2, _ = call('POST', '/auth/login', body={'email': SOLO, 'password': 'x' * 10})
check('an unknown e-mail and a wrong password answer the same (no account oracle)',
      s1 == s2 and b1.get('message') == b2.get('message'), ((s1, b1.get('message')), (s2, b2.get('message'))))
clear_throttle()
burst = [call('POST', '/auth/login', body={'email': SOLO, 'password': 'x' * 10})[0] for _ in range(12)]
check('a burst of sign-ins is throttled (429)', 429 in burst, burst)
sql(f"update users set \"failedLoginAttempts\"=0, \"lockedUntil\"=null where email='{SOLO}'")
clear_throttle()
s, b, _ = call('POST', '/auth/forgot-password', body={'email': 'nobody-' + secrets.token_hex(3) + '@example.test'})
s2, b2, _ = call('POST', '/auth/forgot-password', body={'email': SOLO})
check('forgot-password answers the same for a known and an unknown address', s == s2 and b.get('message') == b2.get('message'),
      ((s, b.get('message')), (s2, b2.get('message'))))

# ── E. password-reset links ───────────────────────────────────────────────────────────────────
print('\n— E. password-reset links')
uid = sql(f"select id from users where email='{SOLO}'")
plain = secrets.token_hex(32)
sql(f"insert into password_reset_tokens (id, \"tokenHash\", \"expiresAt\", used, \"userId\") values "
    f"('l0-'||md5(random()::text), '{hashlib.sha256(plain.encode()).hexdigest()}', now() + interval '1 hour', false, '{uid}')")
clear_throttle()
s, b, _ = call('POST', '/auth/reset-password', body={'token': plain, 'newPassword': SOLO_PW})
check('a fresh link works', s in (200, 201), (s, b))
clear_throttle()
s, b, _ = call('POST', '/auth/reset-password', body={'token': plain, 'newPassword': SOLO_PW})
check('the same link twice → refused', s in (400, 401, 403, 404, 410), (s, b))
old = secrets.token_hex(32)
sql(f"insert into password_reset_tokens (id, \"tokenHash\", \"expiresAt\", used, \"userId\") values "
    f"('l0-'||md5(random()::text), '{hashlib.sha256(old.encode()).hexdigest()}', now() - interval '1 minute', false, '{uid}')")
clear_throttle()
s, b, _ = call('POST', '/auth/reset-password', body={'token': old, 'newPassword': SOLO_PW})
check('an expired link → refused', s in (400, 401, 403, 404, 410), (s, b))
sql("delete from password_reset_tokens where id like 'l0-%'")
clear_throttle()
check('the account still signs in with its password', call('POST', '/auth/login', body={'email': SOLO, 'password': SOLO_PW})[0] in (200, 201))

# ── F. a suspended organization ───────────────────────────────────────────────────────────────
print('\n— F. a suspended organization')
d, _ = login(SOLO, SOLO_PW)
org = sql(f"select \"organizationId\" from users where email='{SOLO}'")
sql(f"update organizations set \"suspendedAt\"=now() where id='{org}'")
try:
    clear_throttle()
    check('door 1 — sign-in refused', call('POST', '/auth/login', body={'email': SOLO, 'password': SOLO_PW})[0] in (401, 403))
    check('door 2 — refresh refused', call('POST', '/auth/refresh', body={'refreshToken': d['refreshToken']})[0] in (401, 403))
    s = call('GET', '/auth/me', d['accessToken'])[0]
    print(f'INFO door 3 at once → {s} (the gateway caches a session up to AUTH_CACHE_TTL_SECONDS, 60 s)')
    if not QUICK:
        print('… waiting 62 s for the auth cache')
        time.sleep(62)
        s = call('GET', '/auth/me', d['accessToken'])[0]
        check('door 3 — every request refused once the cache turns over', s in (401, 403), s)
finally:
    sql(f"update organizations set \"suspendedAt\"=null where id='{org}'")

# ── G. cookie and logs ────────────────────────────────────────────────────────────────────────
print('\n— G. the browser cookie and the log')
clear_throttle()
s, b, h = call('POST', '/auth/login', body={'email': 'manager@example.com', 'password': 'password123', 'client': 'web'},
               headers={'x-client-platform': 'web'})
cookie = h.get('Set-Cookie') or ''
check('the web gets the refresh token as an httpOnly cookie', 'refreshToken=' in cookie and 'HttpOnly' in cookie, cookie[:120])
check('…and never in the body', 'refreshToken' not in b.get('data', {}), list(b.get('data', {}).keys()))
check('…path /, SameSite set', 'Path=/' in cookie and 'SameSite' in cookie, cookie[:160])
if LOG and os.path.exists(LOG):
    tail = subprocess.run(['tail', '-c', '3000000', LOG], capture_output=True, text=True).stdout
    found = re.findall(r'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}', tail)
    check('no access token written to the API log', not found, found[:1])
else:
    print('SKIP the log scan (set API_LOG to the dev API log)')

print(f'\n{len(OK)} passed, {len(BAD)} failed')
sys.exit(1 if BAD else 0)
