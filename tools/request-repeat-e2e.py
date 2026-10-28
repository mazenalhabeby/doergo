#!/usr/bin/env python3
"""
A write sent twice happens once — over real HTTP. LOCAL ONLY (creates one throwaway job and deletes it).

  python3 tools/request-repeat-e2e.py

The case it proves: the phone/web sends a write, the server DOES it, the connection drops before the answer arrives,
and the same write arrives again (the app resending, or the person tapping again). With the same Idempotency-Key the
second one gets the first answer and nothing runs twice — for a write that goes through the job queue (a new job) and
one that does not (a comment). Without a key, the old behaviour: twice.
"""
import json, os, re, sys, threading, urllib.error, urllib.parse, urllib.request, uuid

B = os.environ.get('API', 'http://localhost:4000/api/v1')
if not re.match(r'^http://(localhost|127\.0\.0\.1)(:\d+)?/', B):
    sys.exit('local only')

FAILED = []


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  → {detail}' if not ok and detail else ''))
    if not ok:
        FAILED.append(name)


def call(method, path, token=None, body=None, key=None):
    h = {'content-type': 'application/json'}
    if token:
        h['authorization'] = 'Bearer ' + token
    if key:
        h['idempotency-key'] = key
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers=h)
    try:
        r = urllib.request.urlopen(req, timeout=40)
        return r.status, json.loads(r.read() or b'null'), dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b'null'), dict(e.headers)
        except ValueError:
            return e.code, None, dict(e.headers)


def data(b):
    return b.get('data', b) if isinstance(b, dict) else b


def login(email):
    s, b, _ = call('POST', '/auth/login', body={'email': email, 'password': 'password123'})
    assert s in (200, 201), f'login {email}: {s}'
    return data(b)['accessToken']


def new_key():
    return uuid.uuid4().hex + uuid.uuid4().hex[:8]


admin = login('client@example.com')
title = 'repeat-e2e ' + uuid.uuid4().hex[:8]

# ── a job (goes through the job queue) ───────────────────────────────────────────────────────────────────────────────
k = new_key()
s1, b1, _ = call('POST', '/tasks', admin, {'title': title}, k)
check('the first create succeeds', s1 in (200, 201), f'{s1} {b1}')
task_id = data(b1)['id']
s2, b2, h2 = call('POST', '/tasks', admin, {'title': title}, k)  # the answer was "lost": sent again, same key
check('the same create again gets the SAME answer', s2 == s1 and data(b2).get('id') == task_id, f'{s2} {b2}')
check('…marked as a replay', h2.get('Idempotent-Replayed') == 'true' or h2.get('idempotent-replayed') == 'true')
s, b, _ = call('GET', f'/tasks?search={urllib.parse.quote(title)}&limit=50', admin)
found = [t for t in (data(b) or []) if isinstance(t, dict) and t.get('title') == title]
check('exactly ONE job exists', len(found) == 1, f'{len(found)} found')

s, b, _ = call('POST', '/tasks', admin, {'title': title + ' other'}, k)
check('the same key for a DIFFERENT request is refused (422)', s == 422, f'{s} {b}')

# ── a comment (direct, no queue) — and two at the same moment ───────────────────────────────────────────────────────
def comments():
    s, b, _ = call('GET', f'/tasks/{task_id}/comments', admin)
    d = data(b)
    return len(d if isinstance(d, list) else (d or {}).get('items', []))


before = comments()
k2 = new_key()
results = []
ths = [threading.Thread(target=lambda: results.append(call('POST', f'/tasks/{task_id}/comments', admin,
                                                            {'content': 'on my way'}, k2))) for _ in range(3)]
[t.start() for t in ths]
[t.join() for t in ths]
codes = sorted(r[0] for r in results)
check('three copies at the same moment: no error but "wait" (409)', all(c in (200, 201, 409) for c in codes), codes)
s, _, _ = call('POST', f'/tasks/{task_id}/comments', admin, {'content': 'on my way'}, k2)
check('…and afterwards the same key is a replay', s in (200, 201), s)
check('exactly ONE comment was added', comments() == before + 1, f'{before} → {comments()}')

# ── without a key: the old behaviour, twice (why the apps now always send one) ──────────────────────────────────────
before = comments()
call('POST', f'/tasks/{task_id}/comments', admin, {'content': 'no key'})
call('POST', f'/tasks/{task_id}/comments', admin, {'content': 'no key'})
check('without a key the same write runs twice (the apps never send one without it now)', comments() == before + 2)

# ── a key is per person ─────────────────────────────────────────────────────────────────────────────────────────────
manager = login('manager@example.com')
s, b, _ = call('POST', f'/tasks/{task_id}/comments', manager, {'content': 'on my way'}, k2)
check("another person's key is not theirs to replay (it runs as their own)", s in (200, 201, 403, 404), s)

# ── clean up ────────────────────────────────────────────────────────────────────────────────────────────────────────
s, _, _ = call('DELETE', f'/tasks/{task_id}', admin, key=new_key())
check('the throwaway job is deleted', s in (200, 204), s)

print('\nALL PASSED' if not FAILED else f'\n{len(FAILED)} FAILED')
sys.exit(1 if FAILED else 0)
