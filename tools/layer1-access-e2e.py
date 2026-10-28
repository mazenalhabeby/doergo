#!/usr/bin/env python3
"""
Layer 1 — permissions, attacked over real HTTP. LOCAL ONLY.

  python3 tools/layer1-access-e2e.py [--update-map]

1. THE ACCESS MAP: every GET route without a path parameter, asked by five people — the owner, a manager, an
   employee, an external member and the owner of ANOTHER organization — and the answer class written down
   (tools/layer1-access-map.txt). A route that starts answering somebody it did not answer before fails the check
   until a person reviews it and runs --update-map. A 5xx anywhere fails.
2. ANOTHER ORGANIZATION: every route of every method whose path names a record is called by the other organization's
   owner with a real id from this organization. Any 2xx with content is a leak; every record is read again after and
   must be unchanged.
3. RAISING ONE'S OWN POWER: an employee, a manager and an external member try the doors that hand out power.
4. TAKING IT AWAY: a manager's approval power removed bites within the session cache (60 s), and comes back.
"""
import hashlib, json, os, re, subprocess, sys, time, urllib.error, urllib.request

B = os.environ.get('API', 'http://localhost:4000/api/v1')
if not re.match(r'^http://(localhost|127\.0\.0\.1)(:\d+)?/', B):
    sys.exit('local only')
HERE = os.path.dirname(os.path.abspath(__file__))
MAP_FILE = os.path.join(HERE, 'layer1-access-map.txt')
UPDATE = '--update-map' in sys.argv
FAILED = []


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  → {str(detail)[:400]}' if not ok and detail != '' else ''))
    if not ok:
        FAILED.append(name)


def call(method, path, token=None, body=None):
    h = {'content-type': 'application/json'}
    if token:
        h['authorization'] = 'Bearer ' + token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(B + path, method=method, data=data, headers=h)
    try:
        r = urllib.request.urlopen(req, timeout=40)
        raw = r.read()
        return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception:
        return 0, b''


def j(raw):
    try:
        return json.loads(raw or b'null')
    except ValueError:
        return None


def data(b):
    return b.get('data', b) if isinstance(b, dict) else b


def unthrottle():
    subprocess.run(['docker', 'exec', 'hbcfield-redis', 'sh', '-c',
                    "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del"], capture_output=True)


def sql(q):
    return subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-Atc', q],
                          capture_output=True, text=True).stdout.strip()


def login(email, password='password123'):
    unthrottle()
    s, raw = call('POST', '/auth/login', body={'email': email, 'password': password})
    assert s in (200, 201), f'login {email}: {s}'
    d = data(j(raw))
    return d['accessToken'], d.get('user', {}).get('id')


unthrottle()
PEOPLE = {
    'owner': login('client@example.com'),
    'manager': login('manager@example.com'),
    'employee': login('noor@example.com'),  # holds no role anywhere
    'external': login('klaus.huber@weingaertner.example'),
    'other-org': login('e2e-solo-owner@example.test', 'E2eSolo2026'),
}
OWNER = PEOPLE['owner'][0]
swagger = json.loads(urllib.request.urlopen(B.replace('/api/v1', '') + '/docs-json', timeout=30).read())
ROUTES = [(m.upper(), p[len('/api/v1'):]) for p, v in swagger['paths'].items() for m in v
          if m in ('get', 'post', 'put', 'patch', 'delete')]
# Not a member's door: the operator console (its own staff sign-in), sign-in itself, and the public pages.
SKIP = re.compile(r'^/(platform|auth|billing/webhooks|calendar-feed|public|app/version|health|metrics|sign/)')


def klass(status, raw):
    if 200 <= status < 300:
        d = data(j(raw))
        empty = d in (None, [], {}, '') or (isinstance(d, dict) and d.get('items') == [])
        return '2xx-empty' if empty else '2xx'
    return {401: '401', 402: '402', 403: '403', 404: '404'}.get(status, f'{status // 100}xx' if status else 'none')


# ── 1. the access map ──────────────────────────────────────────────────────────────────────────────────────────────
print('\n── 1. the access map (GET without a parameter × 5 people)')
gets = sorted(p for m, p in ROUTES if m == 'GET' and '{' not in p and not SKIP.match(p))
lines, errors = [], []
for path in gets:
    row = []
    for who, (tok, _) in PEOPLE.items():
        s, raw = call('GET', path, tok)
        if s == 429:
            unthrottle()
            s, raw = call('GET', path, tok)
        c = klass(s, raw)
        if c == '2xx-empty':
            c = '2xx'  # empty or not, the door is open — the map records doors
        if s >= 500 or s == 0:
            errors.append(f'{who} {path} {s}')
        row.append(f'{who}={c}')
    lines.append(f'{path}  ' + ' '.join(row))
check(f'no route fails with a server error ({len(gets)} routes × 5)', not errors, errors[:8])
if UPDATE or not os.path.exists(MAP_FILE):
    open(MAP_FILE, 'w').write('# Layer 1 access map — GET routes without a parameter; reviewed by a person.\n'
                              '# Regenerate after a REVIEWED change: python3 tools/layer1-access-e2e.py --update-map\n'
                              + '\n'.join(lines) + '\n')
    print(f'      map written: {len(lines)} routes')
else:
    old = {l.split('  ')[0]: l for l in open(MAP_FILE).read().splitlines() if l and not l.startswith('#')}
    new = {l.split('  ')[0]: l for l in lines}
    changed = [f'{new[p]}   (was: {old[p].split("  ", 1)[1]})' for p in new if p in old and old[p] != new[p]]
    added = [new[p] for p in new if p not in old]
    check('nobody answers differently than the reviewed map', not changed, changed[:10])
    check('no new GET route is unreviewed', not added, added[:10])
# Hard rules on the map, whatever the baseline says.
other_open = [l for l in lines if 'other-org=2xx' in l and 'owner=2xx' not in l]
check('the other organization is never let in where the owner is not', not other_open, other_open[:5])
ext_wider = [l for l in lines if 'external=2xx' in l and 'employee=2xx' not in l and 'manager=2xx' not in l
             and 'owner=2xx' in l]
print(f'      routes only the external member and the owner open: {len(ext_wider)} (reviewed in the map)')

# ── 2. another organization ─────────────────────────────────────────────────────────────────────────────────────────
print('\n── 2. another organization, with real ids of this one')


def first_id(path):
    s, raw = call('GET', path, OWNER)
    d = data(j(raw))
    if isinstance(d, dict):
        d = d.get('items') or d.get('data') or d.get('rows') or []
    return (d[0] or {}).get('id') if isinstance(d, list) and d and isinstance(d[0], dict) else None


IDS = {
    'tasks': first_id('/tasks?limit=1'), 'assets': first_id('/assets?limit=1'),
    'customers': first_id('/customers?limit=1'), 'documents': first_id('/documents/browse?limit=1'),
    'employees': PEOPLE['employee'][1], 'organizations': PEOPLE['employee'][1], 'users': PEOPLE['employee'][1],
    'locations': first_id('/locations'), 'spaces': first_id('/locations'), 'invoices': first_id('/invoices?limit=1'),
    'workflows': first_id('/workflows'), 'calendar': None, 'chat': first_id('/chat/conversations'),
    'legal-entities': first_id('/legal-entities'), 'space-roles': first_id('/space-roles'),
    'recurring-tasks': first_id('/recurring-tasks'), 'asset-categories': first_id('/asset-categories'),
    'sprints': first_id('/sprints'), 'reports': None, 'overtime': first_id('/overtime/history'),
    'attendance': first_id('/attendance/entries?limit=1'), 'join-requests': first_id('/join-requests'),
}
SPACE = IDS['locations']
known = {k: v for k, v in IDS.items() if v}
print(f'      ids found for: {", ".join(sorted(known))}')


def fill(path):
    head = path.split('/')[1]
    out = path
    for name in re.findall(r'\{(\w+)\}', path):
        if name == 'spaceId':
            val = SPACE
        elif name in ('id', 'taskId') and head in known:
            val = known[head] if name == 'id' else known.get('tasks')
        elif name in ('memberId', 'userId'):
            val = PEOPLE['employee'][1]
        else:
            return None
        if not val:
            return None
        out = out.replace('{' + name + '}', str(val), 1)
    return out


def snapshot():
    snap = {}
    for head, read in [('tasks', '/tasks/{}'), ('assets', '/assets/{}'), ('customers', '/customers/{}'),
                       ('locations', '/locations/{}'), ('invoices', '/invoices/{}'), ('organizations', '/organizations/members/{}')]:
        if known.get(head):
            s, raw = call('GET', read.format(known[head]), OWNER)
            # A draft's issuer is worked out on every read ("frozen" now) — not a change to the record.
            text = re.sub(rb'"frozenAt":"[^"]*"', b'', raw)
            snap[head] = (s, hashlib.sha256(text).hexdigest())
    return snap


before = snapshot()
other = PEOPLE['other-org'][0]
leaks, server_errors, tried = [], [], 0
for method, path in ROUTES:
    if SKIP.match(path) or '{' not in path:
        continue
    url = fill(path)
    if not url:
        continue
    tried += 1
    s, raw = call(method, url, other, {} if method != 'GET' and method != 'DELETE' else None)
    if s == 429:
        unthrottle()
        s, raw = call(method, url, other, {} if method not in ('GET', 'DELETE') else None)
    c = klass(s, raw)
    if c == '2xx':
        leaks.append(f'{method} {path} → {s} {raw[:120]!r}')
    elif s >= 500 or s == 0:
        server_errors.append(f'{method} {path} → {s}')
print(f'      {tried} routes tried with this organization\'s ids')
check('the other organization reads or changes nothing of this one', not leaks, leaks[:10])
check('…and never causes a server error', not server_errors, server_errors[:10])
after = snapshot()
changed = [k for k in before if before[k] != after.get(k)]
check('every record of this organization is unchanged afterwards', not changed, changed)

# ── 3. raising one's own power ──────────────────────────────────────────────────────────────────────────────────────
print('\n── 3. raising one\'s own power')
emp_tok, emp_id = PEOPLE['employee']
man_tok, man_id = PEOPLE['manager']
ext_tok, ext_id = PEOPLE['external']
owner_id = PEOPLE['owner'][1]
roles = data(j(call('GET', '/organizations/roles', OWNER)[1])) or []
roles = roles if isinstance(roles, list) else roles.get('items', [])
admin_role = next((r for r in roles if (r.get('key') or '').lower() in ('admin', 'owner') or r.get('name') == 'Admin'), None)
any_role = admin_role or (roles[0] if roles else None)


def refused(s):
    return s in (400, 403, 404)


s, _ = call('PATCH', f'/organizations/members/{emp_id}', emp_tok, {'role': 'ADMIN'})
check('an employee cannot make himself an administrator', refused(s), s)
if any_role:
    s, _ = call('PATCH', f'/organizations/members/{emp_id}', emp_tok, {'memberRoleId': any_role['id']})
    check('an employee cannot give himself a role', refused(s), s)
s, _ = call('PATCH', f'/organizations/members/{emp_id}', emp_tok, {'canManageUsers': True, 'canViewAllTasks': True})
check('an employee cannot switch his own permissions on', refused(s), s)
s, _ = call('POST', '/organizations/roles', emp_tok, {'name': 'L1 attack', 'permissions': {'canManageUsers': True}})
check('an employee cannot create a role', refused(s), s)
s, _ = call('POST', f'/organizations/members/{owner_id}/reset-password', emp_tok, {})
check("an employee cannot take over the owner's account", refused(s), s)
s, _ = call('POST', f'/organizations/members/{owner_id}/reset-password', man_tok, {})
check("a manager cannot take over the owner's account", refused(s), s)
s, _ = call('PATCH', f'/organizations/members/{man_id}', man_tok, {'role': 'ADMIN', 'canManageUsers': True})
check('a manager cannot raise herself', refused(s), s)
asg = sql(f"select id from space_assignments where \"userId\"='{emp_id}' and \"spaceId\"='{SPACE}' limit 1")
if asg:
    s, _ = call('PUT', f'/spaces/{SPACE}/members/{asg}/permissions', emp_tok,
                {'permissions': {'canManageUsers': True, 'canApproveAttendance': True, 'canGrantSpaceRoles': True}})
    check('an employee cannot write his own workspace permissions', refused(s), s)
s, _ = call('POST', '/approvals/stand-ins', emp_tok, {'toUserId': man_id, 'startsOn': '2026-11-01', 'endsOn': '2026-11-02'})
check('an employee with no approval power cannot hand any to a stand-in', refused(s), s)
org_roles = [r for r in roles if (r.get('scope') or 'ORG') == 'ORG']
if org_roles:
    s, b = call('PATCH', f'/organizations/members/{ext_id}', OWNER, {'memberRoleId': org_roles[0]['id']})
    check('even the owner cannot give an external member an organization-wide role', refused(s), (s, b[:160]))
s, _ = call('PATCH', f'/organizations/members/{ext_id}', ext_tok, {'isExternal': False})
check('an external member cannot make himself staff', refused(s), s)
personal = sql('select count(*) from roles where "personalAssignmentId" is not null')
listed = [r for r in roles if r.get('personalAssignmentId')]
check(f'personal roles ({personal} exist) never appear in the role list', not listed, listed[:2])
s, raw = call('GET', f'/organizations/members/{owner_id}', other)
check("the other organization's owner cannot read this owner", s in (403, 404), s)

# ── 4. giving and taking power ──────────────────────────────────────────────────────────────────────────────────
print('\n── 4. power given and taken away bites within the session cache (60 s)')
probe = '/organizations/members'  # canManageUsers
mgr_role = next((r for r in roles if r.get('name') == 'Manager' and (r.get('scope') or 'ORG') == 'ORG'), None)


def wait_for(want, limit=80):
    t0 = time.time()
    while time.time() - t0 < limit:
        if call('GET', probe, emp_tok)[0] in want:
            return time.time() - t0
        time.sleep(3)
    return None


s0 = call('GET', probe, emp_tok)[0]
check('the plain employee cannot read the member list', s0 == 403, s0)
if mgr_role and s0 == 403:
    try:
        s, b = call('PATCH', f'/organizations/members/{emp_id}', OWNER, {'memberRoleId': mgr_role['id']})
        check('the owner gives her the Manager role', s in (200, 201), (s, b[:200]))
        got = wait_for((200,))
        check('her open session gains it within the cache', got is not None, 'not after 80 s')
        s, b = call('PATCH', f'/organizations/members/{emp_id}', OWNER, {'memberRoleId': None})
        check('the owner takes the role away', s in (200, 201), (s, b[:200]))
        lost = wait_for((401, 403))
        check('her open session loses it within the cache', lost is not None, 'still allowed after 80 s')
        if got is not None and lost is not None:
            print(f'      gained after {got:.0f} s, lost after {lost:.0f} s')
    finally:
        if sql(f"select \"memberRoleId\" from users where id='{emp_id}'"):
            call('PATCH', f'/organizations/members/{emp_id}', OWNER, {'memberRoleId': None})
else:
    print(f'      skipped: probe {s0}, Manager role {bool(mgr_role)}')

print('\nALL PASSED' if not FAILED else f'\n{len(FAILED)} FAILED')
sys.exit(1 if FAILED else 0)
