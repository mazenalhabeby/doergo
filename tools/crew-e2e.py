#!/usr/bin/env python3
"""
Crew job time, end to end over real HTTP (packages/shared/src/tasks/crew.ts).

Against the LOCAL API and the local video demo organization (fictional people,
local password). Never point it at production.

  python3 tools/crew-e2e.py

Each check prints PASS/FAIL; the exit code is the number of failures.
"""
import json, sys, time, urllib.request, urllib.error

API = 'http://localhost:4000/api/v1'
PW = 'VideoDemo!2026'
MAIL = {k: f'{k}@halsteadfield.example' for k in ['mara.kellner', 'douglas.ferriby', 'tobias.okafor', 'priya.rhodes', 'conor.devlin', 'niamh.brennan']}
fails = 0


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                time.sleep(2 + attempt * 3)  # the throttler, not the thing under test
                continue
            try: return e.code, json.loads(e.read() or b'{}')
            except Exception: return e.code, {}


def check(name, ok, detail=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  → {detail}'))
    if not ok: fails += 1


def data(r):
    s, b = r
    return b.get('data', b) if isinstance(b, dict) else b


def code_of(r):
    b = r[1] if isinstance(r[1], dict) else {}
    return b.get('code') or (b.get('error') if isinstance(b.get('error'), str) and b.get('error', '').startswith('CREW') else None) or (b.get('message', {}) if isinstance(b.get('message'), dict) else {}).get('code')


# Sign-ins are rate limited per address: keep the tokens between runs, space new ones out.
CACHE = '/tmp/crew-e2e-tokens.json'
try: cached = json.load(open(CACHE))
except Exception: cached = {}
tok, uid = {}, {}
for k, m in MAIL.items():
    if k in cached and call('GET', '/auth/me', cached[k]['token'])[0] == 200:
        tok[k], uid[k] = cached[k]['token'], cached[k]['id']; continue
    for wait in range(8):
        s, b = call('POST', '/auth/login', body={'email': m, 'password': PW})
        if s != 429: break
        time.sleep(15)
    if s >= 300:
        print(f'cannot sign in {m}: {s} {b}'); sys.exit(99)
    tok[k] = b['data']['accessToken']; uid[k] = b['data']['user']['id']
    json.dump({**cached, **{kk: {'token': tok[kk], 'id': uid[kk]} for kk in tok}}, open(CACHE, 'w'))
    time.sleep(13)
office, owner = tok['mara.kellner'], tok['douglas.ferriby']
T, P, C, N = 'tobias.okafor', 'priya.rhodes', 'conor.devlin', 'niamh.brennan'

# ── crew mode on ──
s, _ = call('PATCH', '/organizations/profile', owner, {'crewMode': True})
check('owner switches crew mode on', s < 300, s)

# ── everyone clocked out first, then in at a workspace they may use ──
for k in [T, P, C, N]:
    st = data(call('GET', '/attendance/status', tok[k]))
    if st and st.get('isClockedIn') and st.get('currentEntry'):
        call('POST', '/attendance/clock-out', tok[k], {'entryId': st['currentEntry']['id']})
spaces = {}
for k in [T, P, C]:
    locs = data(call('GET', '/attendance/clock-in-locations', tok[k])) or []
    loc = next((l for l in locs if l.get('lat') is not None), locs[0] if locs else None)
    spaces[k] = loc
    body = {'locationId': loc['id'], **({'lat': loc['lat'], 'lng': loc['lng'], 'accuracy': 5} if loc.get('lat') is not None else {'lat': 0, 'lng': 0, 'accuracy': 5})}
    s, b = call('POST', '/attendance/clock-in', tok[k], body)
    check(f'{k} clocks in', s < 300, (s, b.get('message')))
space = spaces[T]

# ── one job at a time: the office parks whatever else the crew has in work ──
ACTIVE = {'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'}
for k in [T, P, C]:
    mine = data(call('GET', '/tasks?limit=100', tok[k]))
    rows = mine if isinstance(mine, list) else (mine or {}).get('items', mine.get('data', []) if isinstance(mine, dict) else [])
    for t in rows or []:
        if t.get('status') in ACTIVE:
            call('PATCH', f"/tasks/{t['id']}/status", office, {'status': 'BLOCKED', 'reason': 'Parked for the crew test'})

# ── the job: Tobias leads, Priya and Conor on the crew ──
HERE = {'lat': space.get('lat') or 51.5, 'lng': space.get('lng') or -0.12}
s, b = call('POST', '/tasks', office, {'title': 'E2E crew job', 'spaceId': space['id'], 'priority': 'MEDIUM',
                                       'locationLat': HERE['lat'], 'locationLng': HERE['lng'], 'locationAddress': 'E2E site',
                                       'assignedToId': uid[T], 'assigneeIds': [uid[T], uid[P], uid[C]]})
check('office creates the crew job', s < 300, (s, b))
job = data((s, b))['id']
for to in ['ACCEPTED', 'EN_ROUTE']:
    s, b = call('PATCH', f'/tasks/{job}/status', tok[T], {'status': to})
    check(f'leader moves to {to}', s < 300, (s, b.get('message')))

# Three taps on the step the job is already in: Priya joins from her tap (P2).
s, b = call('PATCH', f'/tasks/{job}/status', tok[P], {'status': 'EN_ROUTE', 'expectedFrom': 'ACCEPTED'})
check('Priya tapping "On the way" too is answered, not refused', s < 300, (s, b.get('message')))
crew = data(call('GET', f'/tasks/{job}/time', tok[P]))['crew']
me = {m['user']['id']: m for m in crew['members']}
check('… and she is now ON the job', me[uid[P]]['joined'], me[uid[P]])
check('the leader is Tobias, not acting', crew['leader'] == {'userId': uid[T], 'acting': False, 'source': 'LEAD'}, crew['leader'])

# "I'm with him": Conor joins from the leader's start.
s, b = call('POST', f'/tasks/{job}/crew/join', tok[C], {'viaLeaderStart': True})
check("Conor: I'm with him", s < 300, (s, b.get('message')))
s, b = call('POST', f'/tasks/{job}/crew/join', tok[C], {'viaLeaderStart': True})
check('joining twice is idempotent', s < 300, s)

# Crew mode: a member cannot move the step.
r = call('PATCH', f'/tasks/{job}/status', tok[P], {'status': 'ARRIVED', **HERE, 'accuracy': 5})
check('crew mode: Priya cannot move the step', r[0] == 400 and 'CREW_LEADER_MOVES_STEPS' in json.dumps(r[1]), r)
s, b = call('PATCH', f'/tasks/{job}/status', tok[T], {'status': 'ARRIVED', **HERE, 'accuracy': 5})
s2, b2 = call('PATCH', f'/tasks/{job}/status', tok[T], {'status': 'IN_PROGRESS', **HERE, 'accuracy': 5})
check('the leader moves it on to work', s < 300 and s2 < 300, (s, b.get('message'), s2, b2.get('message')))

# My issue: only Priya stops.
r = call('POST', f'/tasks/{job}/crew/issue', tok[P], {'reason': '   '})
check('My issue needs a reason', r[0] == 400, r)
s, b = call('POST', f'/tasks/{job}/crew/issue', tok[P], {'reason': 'Waiting for the flange kit'})
check('Priya stops on her own', s < 300, (s, b.get('message')))
time.sleep(61)
v = data(call('GET', f'/tasks/{job}/time', office))
task = data(call('GET', f'/tasks/{job}', office))
check('the job itself stays in work', task['status'] == 'IN_PROGRESS', task['status'])
live = {w['user']['id']: w.get('live') for w in v['byWorker']}
check("Priya's time runs as blocked, the others' as working", live.get(uid[P]) == 'blocked' and live.get(uid[T]) == 'working' and live.get(uid[C]) == 'working', live)
s, b = call('POST', f'/tasks/{job}/crew/resume', tok[P], {})
check('Priya back to work', s < 300, (s, b.get('message')))

# The lead: this job only, to its crew.
r = call('PUT', f'/tasks/{job}/lead', tok[C], {'toUserId': uid[C], 'scope': 'TODAY'})
check('a member cannot take the lead', r[0] == 403, r)
r = call('PUT', f'/tasks/{job}/lead', tok[N], {'toUserId': uid[N], 'scope': 'TODAY'})
check('a stranger learns nothing (404)', r[0] == 404, r)
r = call('PUT', f'/tasks/{job}/lead', tok[T], {'toUserId': uid[N], 'scope': 'TODAY'})
check('never to somebody off this crew', r[0] == 400 and 'CREW_LEAD_TARGET_NOT_ON_CREW' in json.dumps(r[1]), r)
r = call('PUT', f'/tasks/{job}/lead', tok[T], {'toUserId': uid[P], 'scope': 'SOMEDAY'})
check('scope is validated', r[0] == 400, r)
s, b = call('PUT', f'/tasks/{job}/lead', tok[T], {'toUserId': uid[P], 'scope': 'TODAY', 'reason': 'Leaving early'})
check('Tobias hands the lead to Priya for today', s < 300, (s, b.get('message')))
crew = data(call('GET', f'/tasks/{job}/time', office))['crew']
check('Priya leads today', crew['leader']['userId'] == uid[P] and crew['leader']['source'] == 'TODAY', crew['leader'])
r = call('PATCH', f'/tasks/{job}/status', tok[T], {'status': 'BLOCKED', 'reason': 'x'})
check('…and Tobias no longer moves the step', r[0] == 400, r)

# The office takes somebody off, and puts them back — always with a reason.
r = call('POST', f'/tasks/{job}/crew/leave', tok[P], {'forUserId': uid[C], 'reason': 'x'})
check('a member cannot take somebody else off (404)', r[0] == 404, r)
r = call('POST', f'/tasks/{job}/crew/join', office, {'forUserId': uid[C]})
check('the office needs a reason to put somebody on', r[0] == 400, r)
s, b = call('POST', f'/tasks/{job}/crew/leave', office, {'forUserId': uid[C], 'reason': 'Sent to another site'})
check('the office takes Conor off', s < 300 and not {m['user']['id']: m for m in data((s, b))['members']}[uid[C]]['joined'], (s, b.get('message')))
s, b = call('POST', f'/tasks/{job}/crew/join', office, {'forUserId': uid[C], 'reason': 'Back on site, phone flat'})
check('…and puts him back on', s < 300 and {m['user']['id']: m for m in data((s, b))['members']}[uid[C]]['joined'], (s, b.get('message')))

# Leaving: the last joined member out pauses it.
for k in [T, P]:
    s, b = call('POST', f'/tasks/{job}/crew/leave', tok[k], {})
    check(f'{k} leaves', s < 300, (s, b.get('message')))
task = data(call('GET', f'/tasks/{job}', office))
check('still running while Conor is on it', not task.get('pausedAt'), task.get('pausedAt'))
s, b = call('POST', f'/tasks/{job}/crew/leave', tok[C], {})
task = data(call('GET', f'/tasks/{job}', office))
check('the last one out pauses it, and owes the note', bool(task.get('pausedAt')) and task.get('handoverDueById') == uid[C], (task.get('pausedAt'), task.get('handoverDueById')))

# The job's time: everybody counted, inside their shifts.
v = data(call('GET', f'/tasks/{job}/time', office))
credited = {w['user']['id'] for w in v['byWorker']}
check('all three are credited', {uid[T], uid[P], uid[C]} <= credited, credited)
check("Priya's own stop is blocked time for her only", next(w for w in v['byWorker'] if w['user']['id'] == uid[P])['blocked'] >= 1, v['byWorker'])

# History words it.
tl = data(call('GET', f'/tasks/{job}/timeline', office)) or []
types = [e.get('eventType') for e in (tl if isinstance(tl, list) else tl.get('events', []))]
for t in ['CREW_JOINED', 'SELF_BLOCKED', 'SELF_RESUMED', 'LEAD_CHANGED', 'CREW_LEFT']:
    check(f'history has {t}', t in types, types)

# ── Scenario B: the clock-out is the leave; the last JOINED one out pauses ──
# One job at a time: the office closes job A first.
call('PATCH', f'/tasks/{job}/status', office, {'status': 'CANCELED', 'reason': 'Crew test A done'})
for k in [T, P, C]:
    st = data(call('GET', '/attendance/status', tok[k]))
    if not (st and st.get('isClockedIn')):
        loc = spaces[k]
        call('POST', '/attendance/clock-in', tok[k], {'locationId': loc['id'], 'lat': loc.get('lat') or 0, 'lng': loc.get('lng') or 0, 'accuracy': 5})
s, b = call('POST', '/tasks', office, {'title': 'E2E crew job B', 'spaceId': space['id'], 'priority': 'MEDIUM',
                                       'locationLat': HERE['lat'], 'locationLng': HERE['lng'], 'locationAddress': 'E2E site',
                                       'assignedToId': uid[T], 'assigneeIds': [uid[T], uid[P], uid[C]]})
jobB = data((s, b))['id']
for to in ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']:
    s, b = call('PATCH', f'/tasks/{jobB}/status', tok[T], {'status': to, **HERE, 'accuracy': 5})
    check(f'B: leader moves to {to}', s < 300, (s, b.get('message')))
call('POST', f'/tasks/{jobB}/crew/join', tok[P], {'viaLeaderStart': True})
# Conor is on the crew and on the clock but never joins.
mine = {j['id']: j for j in data(call('GET', '/tasks/handover/mine', tok[T]))['open']}
check("B: Tobias's clock-out list knows the crew carries job B on", mine.get(jobB, {}).get('crewContinues') is True, mine.get(jobB))
st = data(call('GET', '/attendance/status', tok[T]))
call('POST', '/attendance/clock-out', tok[T], {'entryId': st['currentEntry']['id']})
task = data(call('GET', f'/tasks/{jobB}', office))
check('B: the leader clocking out does not pause a job Priya is on', not task.get('pausedAt'), task.get('pausedAt'))
crew = data(call('GET', f'/tasks/{jobB}/time', office))['crew']
m = {x['user']['id']: x for x in crew['members']}
check("B: Tobias's clock-out took him off the job", not m[uid[T]]['joined'], m[uid[T]])
check('B: Priya stands in as acting leader', crew['leader'] == {'userId': uid[P], 'acting': True, 'source': 'ACTING'}, crew['leader'])
mine = {j['id']: j for j in data(call('GET', '/tasks/handover/mine', tok[P]))['open']}
check("B: Priya's list says it pauses with her (Conor never joined)", mine.get(jobB, {}).get('crewContinues') is False, mine.get(jobB))
st = data(call('GET', '/attendance/status', tok[P]))
call('POST', '/attendance/clock-out', tok[P], {'entryId': st['currentEntry']['id']})
task = data(call('GET', f'/tasks/{jobB}', office))
check('B: Priya out — paused, though Conor (never joined) is still clocked in', bool(task.get('pausedAt')) and task.get('pausedById') == uid[P], (task.get('pausedAt'), task.get('pausedById')))

# Clean up: crew mode back off, people clocked out.
call('PATCH', '/organizations/profile', owner, {'crewMode': False})
for k in [T, P, C]:
    st = data(call('GET', '/attendance/status', tok[k]))
    if st and st.get('currentEntry'):
        call('POST', '/attendance/clock-out', tok[k], {'entryId': st['currentEntry']['id']})
print(f'\n{fails} failed')
sys.exit(fails)
