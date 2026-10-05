#!/usr/bin/env python3
"""
A task open to a WORK role — end to end over real HTTP (packages/shared/src/tasks/role-pool.ts).

LOCAL ONLY: the local API and the seed-demo organization (client@ / karim@ /
noor@ / dana@ / mike@example.com, password123). Never point it at production.
Uses the local database (docker psql) only to age a task's opening time, so the
waves can be checked without waiting half an hour. Deletes what it made.

  python3 tools/role-tasks-e2e.py

Each check prints PASS/FAIL; the exit code is the number of failures.
"""
import json, subprocess, sys, threading, time, urllib.error, urllib.request

API = 'http://localhost:4000/api/v1'
PW = 'password123'
SPACE = None  # the workspace where karim and noor hold Mechanic (found below)
fails = 0
made: list[str] = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                time.sleep(1.2 * (attempt + 1)); continue
            try: return e.code, json.loads(e.read() or b'{}')
            except Exception: return e.code, {}


def data(res):
    return res.get('data', res) if isinstance(res, dict) else res


def check(name, ok, detail=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  ← {detail}'))
    if not ok: fails += 1


def sql(q):
    return subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-Atc', q],
                          capture_output=True, text=True).stdout.strip()


def login(email):
    # Several runs in a row meet the login rate limit — wait it out rather than fail.
    for attempt in range(8):
        s, r = call('POST', '/auth/login', body={'email': email, 'password': PW})
        if isinstance(data(r), dict) and data(r).get('accessToken'): return data(r)['accessToken']
        time.sleep(15)
    raise SystemExit(f'cannot sign in as {email}: {r}')


admin, karim, noor, dana, mike = (login(f'{n}@example.com') for n in ['client', 'karim', 'noor', 'dana', 'mike'])
row = sql("select sa.\"spaceId\", sa.\"workRoleId\" from space_assignments sa join users u on u.id=sa.\"userId\" "
          "where u.email='karim@example.com' and sa.\"workRoleId\" is not null limit 1")
SPACE, ROLE = row.split('|')
DANA_ROLE = sql(f"select sa.\"workRoleId\" from space_assignments sa join users u on u.id=sa.\"userId\" where u.email='dana@example.com' and sa.\"spaceId\"='{SPACE}'")
print(f'workspace {SPACE} · role {ROLE}')
# Mike becomes the second Mechanic here for the run (karim + mike can take jobs; noor holds
# the role too, but her access profile has no Tasks, so she must be offered nothing).
MIKE_SA = 'e2e-role-mike'
sql(f"delete from space_assignments where id='{MIKE_SA}'")
sql(f"insert into space_assignments (id, \"organizationId\", \"userId\", \"spaceId\", \"workRoleId\", \"updatedAt\") "
    f"select '{MIKE_SA}', u.\"organizationId\", u.id, '{SPACE}', '{ROLE}', now() from users u where u.email='mike@example.com'")


def new_task(title, **extra):
    s, r = call('POST', '/tasks', admin, {'title': title, 'spaceId': SPACE, **extra})
    t = data(r)
    if isinstance(t, dict) and t.get('id'): made.append(t['id'])
    return s, t


# ── Opening ────────────────────────────────────────────────────────────
s, r = call('GET', f'/tasks/role-options?spaceId={SPACE}', admin)
opts = data(r) or []
check('role options list the role with its holders', any(o['id'] == ROLE and o['holders'] >= 2 for o in opts), opts)
s, r = call('GET', f'/tasks/role-preview?spaceId={SPACE}&roleId={ROLE}', admin)
pv = data(r)
check('preview counts who can take it and ranks them', s == 200 and pv['total'] == 2 and len(pv['candidates']) == 2, (s, pv))
check('…without the holder whose profile has no Tasks', not any(c['name'].startswith('Noor') for c in pv['candidates']), pv)
s, r = call('GET', f'/tasks/role-preview?spaceId={SPACE}&roleId={ROLE}', mike)
check('a worker without the right to assign cannot preview', s in (403, 404), s)

s, r = new_task('E2E role both', openRoleId=ROLE, assigneeIds=[sql("select id from users where email='karim@example.com'")])
check('people AND a role at once is refused', s == 400 and r.get('code') == 'ROLE_TASK_PEOPLE_OR_ROLE', (s, r))

s, t2 = new_task('E2E role two', openRoleId=ROLE, openSpots=2)
check('created open to the role, two places', s in (200, 201) and t2.get('openRoleId') == ROLE and t2.get('openSpotsLeft') == 2, (s, t2))
T2 = t2['id']
time.sleep(1.5)
ev = sql(f"select string_agg(\"eventType\"::text, ',') from task_events where \"taskId\"='{T2}'")
check('the history says it was opened to the role', 'OPENED_TO_ROLE' in ev, ev)

# ── Who sees it ────────────────────────────────────────────────────────
s, r = call('GET', '/tasks/open-for-me', karim)
check('a role holder sees it in open-for-me', any(x['id'] == T2 for x in data(r)), data(r))
s, r = call('GET', '/tasks/open-for-me', dana)
check('somebody holding another role does not', not any(x['id'] == T2 for x in data(r)), data(r))
s, r = call('GET', '/tasks/open-for-me', noor)
check('a holder whose profile has no Tasks is offered nothing', data(r) == [], data(r))
s, r = call('GET', f'/tasks/{T2}', karim)
check('a role holder may open the task', s == 200, s)
s, r = call('GET', f'/tasks/{T2}', noor)
check('…a profile without Tasks may not', s in (403, 404), s)
s, r = call('GET', '/tasks?limit=100', karim)
lst = data(r)
items = lst if isinstance(lst, list) else (lst.get('data') or lst.get('items') or [])
check('the normal task list is unchanged (an open task is not "mine")', not any(x.get('id') == T2 for x in items), [x.get('id') for x in items][:5])

s, r = call('GET', f'/tasks/{T2}/attachments', karim)
check('a holder may read its attachments before taking it (same rule as the page)', s == 200, (s, r))
s, r = call('POST', f'/tasks/{T2}/comments', karim, {'content': 'not mine yet'})
check('a holder may READ but not comment before taking it', s in (403, 404), (s, r))

s, td = call('POST', '/tasks', dana, {'title': 'E2E role by space manager', 'spaceId': SPACE, 'openRoleId': DANA_ROLE or ROLE})
td = data(td)
if isinstance(td, dict) and td.get('id'): made.append(td['id'])
check('a workspace-level assigner opens a task to a role in THEIR workspace', s in (200, 201) and td.get('openRoleId') == (DANA_ROLE or ROLE), (s, td))

# ── Taking ─────────────────────────────────────────────────────────────
s, r = call('POST', f'/tasks/{T2}/take', dana)
check('a non-holder cannot take it (404)', s == 404, (s, r))
s, r = call('POST', f'/tasks/{T2}/take', karim)
check('karim takes the first place', s in (200, 201) and data(r)['spotsLeft'] == 1, (s, r))
s, r = call('POST', f'/tasks/{T2}/take', karim)
check('taking twice is refused', s == 409 and r.get('code') == 'ROLE_TASK_ALREADY_YOURS', (s, r))
s, r = call('POST', f'/tasks/{T2}/take', mike)
check('mike takes the second place', s in (200, 201) and data(r)['spotsLeft'] == 0, (s, r))
lead = sql(f"select u.email||':'||ta.role from task_assignees ta join users u on u.id=ta.\"userId\" where ta.\"taskId\"='{T2}' order by ta.\"createdAt\"")
check('the first to take it leads', lead.split('\n')[0] == 'karim@example.com:LEAD', lead)
st = sql(f"select status, \"assignedToId\" is not null from tasks where id='{T2}'")
check('it is an ordinary assignment now (ASSIGNED, a primary)', st == 'ASSIGNED|t', st)

# ── The race: one place, two people at the same instant ────────────────
s, t1 = new_task('E2E role race', openRoleId=ROLE, openSpots=1)
T1 = t1['id']
results = {}
def go(name, tok): results[name] = call('POST', f'/tasks/{T1}/take', tok)
th = [threading.Thread(target=go, args=(n, tk)) for n, tk in (('karim', karim), ('mike', mike))]
[x.start() for x in th]; [x.join() for x in th]
codes = sorted(v[0] for v in results.values())
check('two people at once: exactly one gets it', codes[0] in (200, 201) and codes[1] == 409, results)
loser = [v for v in results.values() if v[0] == 409][0][1]
check('the other is told ROLE_TASK_TAKEN', loser.get('code') == 'ROLE_TASK_TAKEN', loser)
n = sql(f"select count(*) from task_assignees where \"taskId\"='{T1}'")
check('and exactly one crew row exists', n == '1', n)
left = sql(f"select \"openSpotsLeft\" from tasks where id='{T1}'")
check('no place below zero', left == '0', left)

# ── Handing back ───────────────────────────────────────────────────────
winner = [k for k, v in results.items() if v[0] in (200, 201)][0]
wtok = karim if winner == 'karim' else mike
s, r = call('POST', f'/tasks/{T1}/return-to-role', wtok, {'reason': 'Van broke down'})
check('the taker hands it back', s in (200, 201), (s, r))
st = sql(f"select status, \"openSpotsLeft\", \"assignedToId\" is null from tasks where id='{T1}'")
check('back to the role: NEW, one place, nobody on it', st == 'NEW|1|t', st)
ev = sql(f"select metadata->>'reason' from task_events where \"taskId\"='{T1}' and \"eventType\"='RETURNED_TO_ROLE'")
check('the history keeps why', ev == 'Van broke down', ev)
s, r = call('GET', '/tasks/open-for-me', wtok)
check('it is open to them again', any(x['id'] == T1 for x in data(r)), data(r))
s, r = call('POST', f'/tasks/{T1}/take', wtok)
s, r = call('POST', f'/tasks/{T1}/decline', wtok)
st = sql(f"select status, \"openSpotsLeft\" from tasks where id='{T1}'")
check('decline on a role task also returns it to the role', st == 'NEW|1', (s, r, st))

# ── The places follow the crew, however it changes ─────────────────────
MIKE_ID = sql("select id from users where email='mike@example.com'")
s, r = call('DELETE', f'/tasks/{T2}/assignees/{MIKE_ID}', admin)
left = sql(f"select \"openSpotsLeft\" from tasks where id='{T2}'")
check('the office removing a taker gives the place back', s in (200, 204) and left == '1', (s, left))
s, r = call('GET', '/tasks/open-for-me', mike)
check('…and it is open to the role again', any(x['id'] == T2 for x in data(r)), data(r))
OTHER = sql(f"select id from company_locations where \"organizationId\"=(select \"organizationId\" from users where email='client@example.com') and id<>'{SPACE}' and kind='CUSTOMER' limit 1")
s, r = call('PUT', f'/tasks/{T2}', admin, {'spaceId': OTHER})
st = sql(f"select coalesce(\"openRoleId\",'none') from tasks where id='{T2}'")
check('moving the task to another workspace closes it to the role', st == 'none', (s, st))

# ── The office's controls ──────────────────────────────────────────────
s, r = call('PUT', f'/tasks/{T1}', admin, {'openRoleId': DANA_ROLE or ROLE, 'openSpots': 9})
raw = sql(f"select \"openRoleId\", \"openSpots\" from tasks where id='{T1}'")
check('an update (PUT) can never write the open-role columns', raw == f'{ROLE}|1', (s, raw))
s, r = call('PUT', f'/tasks/{T1}/open-role', admin, {'roleId': ROLE, 'spots': 3})
check('the office changes how many it needs', s == 200 and data(r)['openSpotsLeft'] == 3, (s, r))
s, r = call('PUT', f'/tasks/{T1}/open-role', mike, {'roleId': None})
check('a worker cannot close it', s in (403, 404), s)
s, r = call('PUT', f'/tasks/{T1}/open-role', admin, {'roleId': None})
st = sql(f"select coalesce(\"openRoleId\",'none') from tasks where id='{T1}'")
check('the office closes it to the role', s == 200 and st == 'none', (s, st))

# ── Waves ──────────────────────────────────────────────────────────────
s, tw = new_task('E2E role waves', openRoleId=ROLE, openSpots=1)
TW = tw['id']
sql(f"update tasks set \"openedAt\" = now() - interval '12 minutes' where id='{TW}'")
print('… waiting for the minute sweep (≤ 70 s)')
deadline = time.time() + 75
while time.time() < deadline and sql(f"select \"openWave\" from tasks where id='{TW}'") == '0': time.sleep(5)
check('after the widen time the offer widens (wave 1)', sql(f"select \"openWave\" from tasks where id='{TW}'") == '1', sql(f"select \"openWave\" from tasks where id='{TW}'"))
sql(f"update tasks set \"openedAt\" = now() - interval '31 minutes' where id='{TW}'")
deadline = time.time() + 75
while time.time() < deadline and sql(f"select \"openWave\" from tasks where id='{TW}'") != '2': time.sleep(5)
check('after the alert time the creator is told (wave 2)', sql(f"select \"openWave\" from tasks where id='{TW}'") == '2', '')
note = sql(f"select count(*) from notification_deliveries n join users u on u.id=n.\"recipientId\" where u.email='client@example.com' and n.\"eventType\"='task.roleUnclaimed' and n.payload::text like '%{TW}%'")
check('the creator has it in their inbox', note not in ('', '0'), note)

# ── The report ─────────────────────────────────────────────────────────
s, r = call('GET', f'/tasks/role-stats?spaceId={SPACE}', admin)
roles = data(r).get('roles', []) if isinstance(data(r), dict) else []
mech = next((x for x in roles if x['roleId'] == ROLE), None)
check('the report counts takes and minutes to take', s == 200 and mech and mech['taken'] >= 2 and mech['avgMinutesToTake'] is not None, (s, mech))
check('…and the one nobody took in time', mech and mech['overdue'] >= 1, mech)

# ── Clean up ───────────────────────────────────────────────────────────
for tid in made:
    call('DELETE', f'/tasks/{tid}', admin)
sql(f"delete from space_assignments where id='{MIKE_SA}'")
print(f'\n{fails} failed')
sys.exit(fails)
