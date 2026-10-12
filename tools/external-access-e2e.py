#!/usr/bin/env python3
"""
An external member given ONE workspace — end to end over real HTTP
(docs/plans/external-role-builder.md).

LOCAL ONLY: the local API and the seed-demo organization (client@example.com,
password123). Never point it at production. Builds two workspaces A and B (CRM,
assets, portal, time tracking), an external member assigned to A only, gives
them permissions through the BUILDER API, then proves:

  - the builder: forbidden keys refused, the €2 seat follows the permissions,
  - clients: A's visible and editable, B's 404, create only in A, no delete,
  - assets: A's listed, B's 404,
  - hours: approve in A, 404 in B, delete refused without the switch,
  - live map: refused without the switch; with it, A's people and A's job
    routes only — B's person and B's job read as nobody / nothing,
  - the organization's own surfaces closed.

Deletes what it made. Exit code = number of failures.

  python3 tools/external-access-e2e.py
"""
import json, subprocess, sys, time, urllib.error, urllib.request

API = 'http://localhost:4000/api/v1'
PW = 'password123'
ORG = 'cmoyg9pzs0000sbtcdb6r9de7'
A, B = 'e2e-ext-ws-a', 'e2e-ext-ws-b'
EXT_ID, EXT_EMAIL = 'e2e-ext-user', 'e2e.external@client.example'
SA_EXT = 'e2e-ext-sa'
MODS = '["crm","assets","b2c_portal","time_tracking","tracking"]'
WA, WB = 'e2e-ext-worker-a', 'e2e-ext-worker-b'   # a field worker in A, one in B only
fails = 0
_last = [0.0]


def call(method, path, token=None, body=None):
    for attempt in range(6):
        gap = time.time() - _last[0]
        if gap < 0.35: time.sleep(0.35 - gap)
        _last[0] = time.time()
        req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5: time.sleep(2 * (attempt + 1)); continue
            try: return e.code, json.loads(e.read() or b'{}')
            except Exception: return e.code, {}
    return 429, {}


def data(r): return r.get('data', r) if isinstance(r, dict) else r
def items(r):
    d = data(r)
    return d if isinstance(d, list) else (d.get('items') or d.get('data') or []) if isinstance(d, dict) else []
def code(r):
    e = r.get('error') if isinstance(r, dict) and isinstance(r.get('error'), dict) else r
    return (e or {}).get('code') if isinstance(e, dict) else None


def check(name, ok, detail=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  ← {str(detail)[:300]}'))
    if not ok: fails += 1


def sql(q):
    r = subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-v', 'ON_ERROR_STOP=1', '-Atc', q], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr + q)
    return r.stdout.strip()


def login(email):
    for _ in range(6):
        s, r = call('POST', '/auth/login', body={'email': email, 'password': PW})
        if isinstance(data(r), dict) and data(r).get('accessToken'): return data(r)['accessToken']
        time.sleep(10)
    raise SystemExit(f'login {email}: {s} {r}')


def cleanup():
    sql(f"delete from location_history where \"userId\" in ('{WA}','{WB}')")
    sql(f"delete from worker_last_locations where \"userId\" in ('{WA}','{WB}')")
    sql("delete from tasks where id in ('e2e-ext-task-a','e2e-ext-task-b')")
    sql(f"delete from customers where \"spaceId\" in ('{A}','{B}') or name like 'E2E-EXT %'")
    sql(f"delete from assets where \"categoryId\" in ('e2e-ext-kind-a','e2e-ext-kind-b')")
    sql("delete from asset_categories where id in ('e2e-ext-kind-a','e2e-ext-kind-b')")
    sql(f"delete from breaks where \"timeEntryId\" in (select id from time_entries where \"locationId\" in ('{A}','{B}'))")
    sql(f"delete from time_entries where \"locationId\" in ('{A}','{B}')")
    sql(f"delete from roles where \"personalAssignmentId\" in (select id from space_assignments where \"spaceId\" in ('{A}','{B}'))")
    sql(f"delete from space_assignments where \"spaceId\" in ('{A}','{B}')")
    sql(f"delete from refresh_tokens where \"userId\"='{EXT_ID}'")
    sql(f"delete from users where id in ('{EXT_ID}','{WA}','{WB}')")
    sql(f"delete from company_locations where id in ('{A}','{B}')")


cleanup()
for ws, lat in ((A, 48.30), (B, 48.40)):
    sql(f"""insert into company_locations (id,"organizationId",name,address,lat,lng,"geofenceRadius",timezone,"workModel","geofencePolicy",kind,"enabledModules","isActive","isRemote","isDefault","createdAt","updatedAt")
            values ('{ws}','{ORG}','E2E ext {ws[-1].upper()}','E2E',{lat},14.29,100,'Europe/Vienna','NONE','STRICT','CUSTOMER','{MODS}',true,false,false,now(),now())""")
    sql(f"""insert into asset_categories (id,"organizationId",name,"spaceId","updatedAt") values ('e2e-ext-kind-{ws[-1]}','{ORG}','E2E kind {ws[-1]}','{ws}',now())""")
    sql(f"""insert into assets (id,"organizationId",name,"categoryId","updatedAt") values ('e2e-ext-asset-{ws[-1]}','{ORG}','E2E asset {ws[-1]}','e2e-ext-kind-{ws[-1]}',now())""")
sql(f"""insert into users (id,email,"passwordHash","firstName","lastName",role,"organizationId","isExternal","onboardingCompleted","updatedAt")
        select '{EXT_ID}','{EXT_EMAIL}',"passwordHash",'Klaus','Huber','EMPLOYEE','{ORG}',true,true,now() from users where email='mike@example.com'""")
sql(f"""insert into space_assignments (id,"organizationId","userId","spaceId","isPrimary","allowSecondRole","effectiveFrom","createdAt","updatedAt")
        values ('{SA_EXT}','{ORG}','{EXT_ID}','{A}',true,false,now()-interval '1 day',now(),now())""")
LISA = sql("select id from users where email='lisa@example.com'")
for ws in (A, B):
    sql(f"""insert into space_assignments (id,"organizationId","userId","spaceId","isPrimary","allowSecondRole","effectiveFrom","createdAt","updatedAt")
            values ('e2e-ext-lisa-{ws[-1]}','{ORG}','{LISA}','{ws}',false,false,now()-interval '1 day',now(),now())""")
    for n in (1, 2):
        sql(f"""insert into time_entries (id,"organizationId","userId","locationId",status,"clockInAt","clockOutAt","clockInLat","clockInLng","approvalStatus","flagReasons","totalMinutes","createdAt","updatedAt")
                values ('e2e-ext-te-{ws[-1]}{n}','{ORG}','{LISA}','{ws}','CLOCKED_OUT',now()-interval '{n+1} days',now()-interval '{n+1} days'+interval '8 hours',48.3,14.29,'PENDING','{{LATE_ARRIVAL}}',480,now(),now())""")

ADMIN_ID = sql("select id from users where email='client@example.com'")
for w, ws in ((WA, A), (WB, B)):
    sql(f"""insert into users (id,email,"passwordHash","firstName","lastName",role,"organizationId","onboardingCompleted","updatedAt")
            select '{w}','{w}@e2e.example',"passwordHash",'E2E','Worker {ws[-1].upper()}','EMPLOYEE','{ORG}',true,now() from users where email='mike@example.com'""")
    sql(f"""insert into space_assignments (id,"organizationId","userId","spaceId","isPrimary","allowSecondRole","effectiveFrom","createdAt","updatedAt")
            values ('{w}-sa','{ORG}','{w}','{ws}',true,false,now()-interval '1 day',now(),now())""")
    sql(f"""insert into worker_last_locations (id,"userId",lat,lng,"updatedAt") values ('{w}-loc','{w}',48.3,14.29,now())""")
    t = f'e2e-ext-task-{ws[-1]}'
    sql(f"""insert into tasks (id,title,"organizationId","createdById","assignedToId","spaceId",status,"routeStartedAt","updatedAt")
            values ('{t}','E2E route {ws[-1]}','{ORG}','{ADMIN_ID}','{w}','{ws}','EN_ROUTE',now()-interval '10 minutes',now())""")
    sql(f"""insert into location_history (id,"userId","taskId",lat,lng,timestamp) values ('{t}-p1','{w}','{t}',48.30,14.29,now()-interval '5 minutes'),
            ('{t}-p2','{w}','{t}',48.31,14.29,now()-interval '1 minute')""")

admin = login('client@example.com')
s, r = call('POST', '/customers', admin, {'name': 'E2E-EXT client A', 'spaceId': A})
CA = data(r)['id']
s, r = call('POST', '/customers', admin, {'name': 'E2E-EXT client B', 'spaceId': B})
CB = data(r)['id']

try:
    print('— the builder')
    path = f'/spaces/{A}/members/{SA_EXT}/permissions'
    s, r = call('PUT', path, admin, {'permissions': {'canViewAllTasks': True, 'canManageUsers': True}})
    check('an external member cannot be given canManageUsers', s == 400 and code(r) == 'EXTERNAL_PERMISSION_FORBIDDEN', (s, r))
    s, r = call('PUT', path, admin, {'permissions': {'canViewAllTasks': True, 'canCreateTasks': True}})
    check('the observer set is saved and is the €2 seat', s == 200 and data(r).get('observerSeat') is True and data(r).get('preset') == 'observer', (s, r))
    perms = {'canViewAllTasks': True, 'canViewSpaceAttendance': True, 'canApproveAttendance': True,
             'crmViewAll': True, 'crmCreateClients': True, 'crmEditInfo': True, 'crmWork': True, 'canViewAssets': True}
    s, r = call('PUT', path, admin, {'permissions': perms})
    v = data(r)
    check('a custom set becomes this person’s own role — a full seat', s == 200 and v.get('personal') is True and v.get('observerSeat') is False, (s, r))
    check('the role is hidden from every role list', sql(f"select count(*) from roles where \"personalAssignmentId\"='{SA_EXT}'") == '1'
          and not any(x.get('id') == v.get('roleId') for x in items(call('GET', f'/spaces/{A}/roles', admin)[1])), v.get('roleId'))

    ext = login(EXT_EMAIL)
    s, r = call('PUT', path, ext, {'permissions': perms})
    check('the external member cannot edit their own permissions', s in (403, 404), (s, r))

    print('— clients')
    s, r = call('GET', '/customers?limit=100', ext)
    ids = [c.get('id') for c in items(r)]
    check('sees workspace A’s client', s == 200 and CA in ids, (s, ids))
    check('never workspace B’s', CB not in ids, ids)
    s, r = call('GET', f'/customers/{CB}', ext)
    check('B’s client by id is 404', s == 404, s)
    s, r = call('PATCH', f'/customers/{CA}', ext, {'phone': '+43 664 0000000'})
    check('edits A’s client', s == 200, (s, r))
    s, r = call('POST', '/customers', ext, {'name': 'E2E-EXT made by external', 'spaceId': A})
    check('adds a client in A', s in (200, 201), (s, r))
    s, r = call('POST', '/customers', ext, {'name': 'E2E-EXT in B', 'spaceId': B})
    check('cannot add a client in B', s == 403, (s, r))
    s, r = call('POST', '/customers', ext, {'name': 'E2E-EXT unfiled'})
    check('cannot add an unfiled client', s == 400, (s, r))
    s, r = call('DELETE', f'/customers/{CA}', ext)
    check('cannot delete without the delete level', s == 403, (s, r))
    s, r = call('POST', '/customers/import', ext, {'items': []})
    check('the address-book import stays closed', s == 403, s)

    print('— assets')
    s, r = call('GET', '/assets?limit=100', ext)
    aids = [a.get('id') for a in items(r)]
    check('sees A’s asset', s == 200 and 'e2e-ext-asset-a' in aids, (s, aids))
    check('never B’s', 'e2e-ext-asset-b' not in aids, aids)
    s, r = call('GET', '/assets/e2e-ext-asset-b', ext)
    check('B’s asset by id is 404', s == 404, s)
    s, r = call('PATCH', '/assets/e2e-ext-asset-a', ext, {'name': 'renamed'})
    check('cannot manage without the manage level', s == 403, s)

    print('— hours')
    s, r = call('POST', '/attendance/approvals/e2e-ext-te-a1/approve', ext, {})
    check('approves an entry in A', s in (200, 201) and sql("select \"approvalStatus\" from time_entries where id='e2e-ext-te-a1'") == 'APPROVED', (s, r))
    s, r = call('POST', '/attendance/approvals/e2e-ext-te-b1/approve', ext, {})
    check('an entry in B is out of reach', s in (403, 404) and sql("select \"approvalStatus\" from time_entries where id='e2e-ext-te-b1'") == 'PENDING', (s, r))
    s, r = call('DELETE', '/attendance/entries/e2e-ext-te-a2', ext)
    check('cannot delete without the delete switch', s == 403 and sql("select count(*) from time_entries where id='e2e-ext-te-a2'") == '1', (s, r))
    s, r = call('PUT', path, admin, {'permissions': {**perms, 'canDeleteAttendance': True}})
    ext = login(EXT_EMAIL)  # a fresh session reads the new grant
    s, r = call('DELETE', '/attendance/entries/e2e-ext-te-a2', ext)
    check('with the switch on, deletes an entry in A', s == 200 and sql("select count(*) from time_entries where id='e2e-ext-te-a2'") == '0', (s, r))
    s, r = call('DELETE', '/attendance/entries/e2e-ext-te-b2', ext)
    check('…but never in B', s in (403, 404) and sql("select count(*) from time_entries where id='e2e-ext-te-b2'") == '1', (s, r))

    print('— live map')
    s, r = call('GET', '/tracking/workers', ext)
    check('no live map without the tracking switch', s == 403, s)
    s, r = call('PUT', path, admin, {'permissions': {**perms, 'canDeleteAttendance': True, 'canViewTracking': True}})
    ext = login(EXT_EMAIL)
    s, r = call('GET', '/tracking/workers', ext)
    wids = [w.get('id') for w in items(r)]
    check('the live map shows A’s worker', s == 200 and WA in wids, (s, wids))
    check('…and never B’s', WB not in wids, wids)
    s, r = call('GET', f'/tracking/workers/{WB}', ext)
    check('B’s worker by id reads as nobody', s == 200 and data(r) is None, (s, r))
    s, r = call('GET', f'/tracking/workers/{WA}/history', ext)
    check('A’s worker history = A’s job points', s == 200 and len(items(r)) == 2, (s, r))
    s, r = call('GET', '/tracking/tasks/e2e-ext-task-a/route', ext)
    check('A’s job route', s == 200 and isinstance(data(r), dict) and len(data(r).get('points') or []) == 2, (s, r))
    s, r = call('GET', '/tracking/tasks/e2e-ext-task-b/route', ext)
    check('B’s job route reads as nothing', s == 200 and data(r) is None, (s, r))
    s, r = call('GET', f'/tracking/workers/{WB}/current-route', ext)
    check('B’s drive in progress reads as nothing', s == 200 and data(r) is None, (s, r))
    s, r = call('GET', '/tracking/workers', admin)
    awids = [w.get('id') for w in items(r)]
    check('the admin’s map is unchanged (both)', WA in awids and WB in awids, awids)

    print('— the organization’s own')
    for p in ['/calendar?from=2026-10-01&to=2026-10-31', '/invoices', '/billing/bill', '/organizations/members', '/analytics/catalog', '/legal-entities']:
        s, r = call('GET', p, ext)
        check(f'{p.split("?")[0]} is closed', s in (403, 404), s)
    s, r = call('GET', '/locations', ext)
    names = [x.get('id') for x in items(r)]
    check('sees workspace A only in the workspace list', A in names and B not in names, names)
finally:
    cleanup()

print(f'\n{fails} failure(s)')
sys.exit(fails)
