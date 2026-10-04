#!/usr/bin/env python3
"""
Work roles, day rates and dated rates — end to end over real HTTP.

Against the LOCAL API and the local video demo organization (fictional people,
local password). Never point it at production. Seeds its own CUSTOMER workspace,
roles, clock-ins and finished jobs, checks every rule the mockup agreed, then
deletes everything it made.

  python3 tools/work-roles-e2e.py

Each check prints PASS/FAIL; the exit code is the number of failures.
"""
import datetime as dt, json, subprocess, sys, time, urllib.request, urllib.error, uuid

API = 'http://localhost:4000/api/v1'
import os as _os
if _os.environ.get('DEMO_ORG') == 'acme':
    # The seed-demo organization (password123), for a walk-through in the browser.
    PW = 'password123'
    MAIL = {'douglas.ferriby': 'client@example.com', 'mara.kellner': 'manager@example.com',
            'tobias.okafor': 'karim@example.com', 'conor.devlin': 'noor@example.com', 'niamh.brennan': 'dana@example.com'}
else:
    PW = 'VideoDemo!2026'
    MAIL = {k: f'{k}@halsteadfield.example' for k in ['douglas.ferriby', 'mara.kellner', 'tobias.okafor', 'conor.devlin', 'niamh.brennan']}
import os
KEEP = os.environ.get('KEEP') == '1'  # leave the data in place to look at it in the browser
TAG = '' if KEEP else f'E2E-WR-{int(time.time())}'
N = lambda x: f'{TAG} {x}'.strip()
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
    m = b.get('message')
    return b.get('code') or (m.get('code') if isinstance(m, dict) else None)


def psql(sql):
    user = subprocess.check_output(['docker', 'exec', 'hbcfield-postgres', 'printenv', 'POSTGRES_USER']).decode().strip()
    db = subprocess.check_output(['docker', 'exec', 'hbcfield-postgres', 'printenv', 'POSTGRES_DB']).decode().strip()
    return subprocess.check_output(['docker', 'exec', '-i', 'hbcfield-postgres', 'psql', '-U', user, '-d', db, '-Atq', '-v', 'ON_ERROR_STOP=1'],
                                   input=sql.encode()).decode().strip()


TODAY = dt.date.today()
day = lambda n: (TODAY + dt.timedelta(days=n)).isoformat()

# ── Sign in (tokens cached between runs: sign-ins are rate limited) ──────────
CACHE = f"/tmp/work-roles-e2e-tokens{'-acme' if _os.environ.get('DEMO_ORG') == 'acme' else ''}.json"
try: cached = json.load(open(CACHE))
except Exception: cached = {}
tok, uid = {}, {}
for k, m in MAIL.items():
    if k in cached and call('GET', '/auth/me', cached[k]['token'])[0] == 200:
        tok[k], uid[k] = cached[k]['token'], cached[k]['id']; continue
    for wait in range(8):
        s, b = call('POST', '/auth/login', body={'email': m, 'password': PW})
        if s in (200, 201): break
        time.sleep(5)
    d = b.get('data', b)
    tok[k] = d.get('accessToken') or d.get('tokens', {}).get('accessToken')
    uid[k] = (d.get('user') or {}).get('id')
    cached[k] = {'token': tok[k], 'id': uid[k]}
json.dump(cached, open(CACHE, 'w'))
ADMIN, MGR = tok['douglas.ferriby'], tok['mara.kellner']
ORG = psql(f"select \"organizationId\" from users where id='{uid['douglas.ferriby']}'")
PATRICK, MARK, AHMED = uid['tobias.okafor'], uid['conor.devlin'], uid['niamh.brennan']

def reset_member_costs():
    # The workers' own cost rates live on their account, outside the workspace this run deletes.
    ids = ','.join(f"'{u}'" for u in (PATRICK, MARK, AHMED))
    psql(f'delete from rate_history where target=\'MEMBER\' and "targetId" in ({ids}); '
         f'update users set "costRateCents" = null, "billRateCents" = null where id in ({ids});')

reset_member_costs()
space = None
made_roles = []
try:
    # ── A workspace for a client, with an hourly rate ────────────────────────
    s, b = call('POST', '/locations', ADMIN, {'name': N('BILLA demo' if KEEP else 'BILLA AG'), 'kind': 'CUSTOMER', 'billableRateCents': 6000})
    check('create a CUSTOMER workspace', s in (200, 201), b)
    space = data((s, b))['id']

    # ── Roles ────────────────────────────────────────────────────────────────
    def mk(body):
        s, b = call('POST', '/space-roles', ADMIN, body)
        r = data((s, b)); made_roles.append(r['id']); return s, r
    s, mech = mk({'name': N('Mechanic'), 'kind': 'WORK', 'permissions': {'canManageUsers': True}})
    check('a work role is created', s in (200, 201), mech)
    check('…and grants nothing, whatever was sent', mech.get('permissions') == {}, mech.get('permissions'))
    _, elec = mk({'name': N('Electrician'), 'kind': 'WORK'})
    _, lead = mk({'name': N('Team Leader'), 'kind': 'MANAGEMENT', 'permissions': {'canApproveOvertime': True}})
    check('a management role keeps its permissions', lead.get('permissions') == {'canApproveOvertime': True}, lead)

    # ── Day rates: first one applies since always, later ones from their day ─
    r = call('PUT', f'/spaces/{space}/roles/{mech["id"]}/day-rate', ADMIN, {'cents': 20000})
    check('first day rate saved', r[0] in (200, 201), r[1])
    check('…and applies since always', data(r).get('effectiveFrom') == '1970-01-01', data(r))
    r = call('PUT', f'/spaces/{space}/roles/{mech["id"]}/day-rate', ADMIN, {'cents': 22000, 'effectiveFrom': day(-8)})
    check('a raise from 8 days ago is recorded', r[0] in (200, 201) and data(r).get('nowCents') == 22000, r[1])
    r = call('PUT', f'/spaces/{space}/roles/{mech["id"]}/day-rate', ADMIN, {'cents': 23000, 'effectiveFrom': day(30)})
    check('a raise next month is scheduled, today stays 220', data(r).get('nowCents') == 22000, r[1])
    r = call('PUT', f'/spaces/{space}/roles/{mech["id"]}/day-rate', ADMIN, {'cents': 1, 'effectiveFrom': '2026-02-30'})
    check('an impossible day is refused (400)', r[0] == 400, r)
    r = call('PUT', f'/spaces/{space}/roles/{lead["id"]}/day-rate', ADMIN, {'cents': 1})
    check('a management role has no day rate (400)', r[0] == 400, r)
    call('PUT', f'/spaces/{space}/roles/{elec["id"]}/day-rate', ADMIN, {'cents': 18000})
    r = call('PUT', f'/spaces/{space}/roles/{mech["id"]}/day-rate', tok['tobias.okafor'], {'cents': 1})
    check('a worker cannot set a day rate (403)', r[0] == 403, r)

    roles = {x['id']: x for x in data(call('GET', f'/spaces/{space}/roles', ADMIN))}
    m = roles[mech['id']]
    check('role card: day rate now = 220', m['dayRateCents'] == 22000, m['dayRateCents'])
    check('role card: history 200 → 220 → 230 scheduled',
          [(h['cents'], h['state']) for h in m['dayRateHistory']] == [(20000, 'past'), (22000, 'past'), (23000, 'scheduled')], m['dayRateHistory'])

    # ── Members: one trade, a second role only when allowed ──────────────────
    def assign(user, role):
        return call('POST', f'/spaces/{space}/members', ADMIN, {'userId': user, 'spaceRoleId': role})
    assign(PATRICK, mech['id']); assign(MARK, mech['id']); assign(AHMED, elec['id'])
    members = {x['userId']: x for x in data(call('GET', f'/spaces/{space}/members', ADMIN))}
    check('a trade lands in the work slot', members[PATRICK]['workRole']['id'] == mech['id'] and members[PATRICK]['spaceRole'] is None, members[PATRICK])
    pid, mid = members[PATRICK]['id'], members[MARK]['id']
    # Billing is set on each PERSON: Patrick hours + days, Ahmed days only, Mark left as default (hours).
    r = call('PATCH', f'/spaces/{space}/members/{pid}/roles', ADMIN, {'billBy': 'BOTH'})
    check('billing is set on the member (Patrick: hour + day)', data(r).get('effectiveBillBy') == 'BOTH', r)
    call('PATCH', f"/spaces/{space}/members/{members[AHMED]['id']}/roles", ADMIN, {'billBy': 'DAY'})
    check('a member with no billing chosen is billed by the hour', members[MARK].get('effectiveBillBy') == 'HOUR', members[MARK])

    r = call('PATCH', f'/spaces/{space}/members/{pid}/roles', ADMIN, {'managementRoleId': lead['id']})
    check('a second role is refused until allowed', r[0] == 400 and code_of(r) == 'SECOND_ROLE_NOT_ALLOWED', r)
    r = call('PATCH', f'/spaces/{space}/members/{pid}/roles', ADMIN, {'allowSecondRole': True})
    r = call('PATCH', f'/spaces/{space}/members/{pid}/roles', ADMIN, {'managementRoleId': lead['id']})
    check('…and accepted once allowed (Mechanic + Team Leader)', r[0] == 200 and data(r)['spaceRole']['id'] == lead['id'], r)
    r = call('PATCH', f'/spaces/{space}/members/{pid}/roles', ADMIN, {'allowSecondRole': False})
    check('switching it off while holding both is refused, not a silent drop', r[0] == 400, r)
    r = call('PATCH', f'/spaces/{space}/members/{mid}/roles', ADMIN, {'billBy': 'HOUR'})
    check('Mark: hours only, chosen on Mark (same trade as Patrick, billed differently)', data(r).get('effectiveBillBy') == 'HOUR', r)
    r = call('PATCH', f'/spaces/{space}/members/{mid}/roles', ADMIN, {'workRoleId': lead['id']})
    check('a management role cannot sit in the work slot', r[0] == 400 and code_of(r) == 'WORK_ROLE_NOT_WORK', r)
    r = call('PATCH', '/space-roles/' + mech['id'], ADMIN, {'kind': 'MANAGEMENT'})
    check('a role in use keeps its kind', r[0] == 400, r)

    roles = {x['id']: x for x in data(call('GET', f'/spaces/{space}/roles', ADMIN))}
    check('role card lists who holds it here', sorted(h['id'] for h in roles[mech['id']]['holders']) == sorted([PATRICK, MARK]), roles[mech['id']]['holders'])

    # ── Mark's hourly rate here, then a raise 5 days ago ─────────────────────
    r = call('PATCH', f'/spaces/{space}/members/{mid}/rate', ADMIN, {'billRateCents': 8500})
    r = call('PATCH', f'/spaces/{space}/members/{mid}/rate', ADMIN, {'billRateCents': 9000, 'effectiveFrom': day(-5)})
    check('a dated hourly raise is accepted', r[0] == 200 and data(r).get('billRateCents') == 9000, r)

    # ── Cost is for people allowed to see cost ───────────────────────────────
    # A manager of THIS workspace only (the built-in Space Manager role here) may
    # manage its people, but holds no labour-cost permission. Org-wide user
    # managers do — by the product's own rule — so they are not the test.
    sm = next((x for x in data(call('GET', f'/spaces/{space}/roles', ADMIN)) if x['isSystem'] and x.get('kind') != 'WORK'
               and (x.get('permissions') or {}).get('canManageUsers')), None)
    aid = members[AHMED]['id']
    call('PATCH', f'/spaces/{space}/members/{aid}/roles', ADMIN, {'allowSecondRole': True})
    r = call('PATCH', f'/spaces/{space}/members/{aid}/roles', ADMIN, {'managementRoleId': sm['id']}) if sm else (0, {})
    check('Ahmed: Electrician + Space Manager here', r[0] == 200, r)
    call('PATCH', f'/spaces/{space}/members/{mid}/rate', ADMIN, {'costRateCents': 2500})
    time.sleep(65)  # the gateway caches a session's access for up to 60s
    NIAMH = tok['niamh.brennan']
    s, b = call('GET', f'/spaces/{space}/members', NIAMH)
    check('a workspace manager can list its people', s == 200, (s, b))
    check('…but sees no cost rate', 'costRateCents' not in json.dumps(b), 'leaked')
    check('…while still seeing bill rates', 'billRateCents' in json.dumps(b), b)
    r = call('PATCH', f'/spaces/{space}/members/{mid}/rate', NIAMH, {'costRateCents': 100})
    check('…and cannot set a cost (403)', r[0] == 403, r)
    r = call('PATCH', f'/spaces/{space}/members/{mid}/rate', NIAMH, {'billRateCents': 9000, 'effectiveFrom': day(-5)})
    check('…but can set what the client pays', r[0] == 200 and 'costRateCents' not in json.dumps(r[1]), r)
    s, b = call('GET', f'/spaces/{space}/members', ADMIN)
    check('an admin sees the cost rate', '2500' in json.dumps(b), b)
    r = call('PATCH', f'/spaces/{space}/members/{pid}/roles', NIAMH, {'managementRoleId': lead['id']})
    check('a workspace manager may hand out what they hold', r[0] == 200, r)

    # ── Work done: clock-ins and finished jobs, straight into the database ───
    def clock(user, n, status='AUTO'):
        return (f"insert into time_entries (id,\"userId\",\"locationId\",\"organizationId\",\"clockInLat\",\"clockInLng\",\"clockInAt\",\"clockOutAt\",status,\"approvalStatus\",\"updatedAt\") "
                f"values ('{uuid.uuid4()}','{user}','{space}','{ORG}',0,0,'{day(n)} 08:00','{day(n)} 16:00','CLOCKED_OUT','{status}',now());")
    def job(user, n, hours, title):
        t = str(uuid.uuid4())
        return (f"insert into tasks (id,title,status,\"organizationId\",\"createdById\",\"assignedToId\",\"spaceId\",\"updatedAt\") values ('{t}','{N(title)}','COMPLETED','{ORG}','{uid['douglas.ferriby']}','{user}','{space}',now());"
                f"insert into service_reports (id,\"taskId\",summary,\"workDuration\",\"completedAt\",\"completedById\",\"organizationId\",\"updatedAt\") values ('{uuid.uuid4()}','{t}','done',{int(hours*3600)},'{day(n)} 12:00','{user}','{ORG}',now());")
    sql = ''.join(clock(PATRICK, n) for n in [-15, -12, -10, -9, -7, -5, -3])
    sql += clock(PATRICK, -12)  # a second shift the same day — still one day
    sql += clock(PATRICK, -11, 'REJECTED')  # a manager rejected it — not a day worked
    sql += ''.join(clock(AHMED, n) for n in [-14, -6, -2])
    sql += ''.join(clock(MARK, n) for n in [-11, -4])
    sql += job(PATRICK, -13, 3, 'Pump') + job(PATRICK, -4, 5, 'Valve')
    sql += job(MARK, -12, 4, 'Cooling') + job(MARK, -3, 6, 'Leak')
    sql += job(AHMED, -6, 8, 'Wiring')
    psql(sql)

    # ── Gather: every job and day at the rate of ITS day ─────────────────────
    g = data(call('GET', f'/invoices/gather?spaceId={space}&from={day(-20)}&to={day(-1)}', ADMIN))
    runs = [(d['workerId'], d['days'], d['dayRateCents']) for d in g.get('dayEntries', [])]
    # Patrick clocked in on 7 days and finished jobs on 2 more (-13, -4) without clocking in.
    check('Patrick: 5 days at 200, then 4 at 220 (split at the raise)',
          (PATRICK, 5, 20000) in runs and (PATRICK, 4, 22000) in runs, runs)
    check('a finished job counts its day; the rejected clock-in and the second shift add none',
          sum(d['days'] for d in g['dayEntries'] if d['workerId'] == PATRICK) == 9, runs)
    check('Ahmed: 3 days at 180', (AHMED, 3, 18000) in runs, runs)
    check('Mark: hours only — no days', all(w != MARK for w, _, _ in runs), runs)
    jobs = {w['taskTitle'].split(' ', 1)[-1]: w for w in g['workEntries'] if w['taskTitle'].startswith(TAG)}
    check('Mark\'s job before his raise: 85/h', jobs['Cooling']['billRateCents'] == 8500, jobs['Cooling'])
    check('Mark\'s job after his raise: 90/h', jobs['Leak']['billRateCents'] == 9000, jobs['Leak'])
    check('Patrick\'s jobs: the client\'s 60/h', jobs['Pump']['billRateCents'] == 6000, jobs['Pump'])
    check('Ahmed (days only): his job is listed, not charged by the hour',
          jobs['Wiring']['hoursBillable'] is False and jobs['Wiring']['laborAmount'] == 0, jobs['Wiring'])
    check('jobs carry the trade', jobs['Pump']['workRoleName'] == N('Mechanic'), jobs['Pump'])

    # ── The worker's statement: same hours, HIS rate ─────────────────────────
    st = data(call('GET', f'/organizations/members/{MARK}/statement?from={day(-20)}&to={day(-1)}', ADMIN))
    here = [l for l in st.get('lines', []) if l['spaceId'] == space]
    check('statement: Mark\'s 10 hours here (4 + 6)', sum(l['hours'] for l in here) == 10, st)
    check('statement: at his cost with us (25/h), never the client\'s 85 or 90',
          all(l['rateCents'] == 2500 for l in here) and sum(l['amountCents'] for l in here) == 25000, here)
    check('statement: says where the rate came from', all(l['rateLevel'] == 'contract' for l in here), here)
    check('statement: days on site, by the invoice\'s rule (2 clock-ins + 2 job days)', st.get('daysBySpace', {}).get(space) == 4, st.get('daysBySpace'))
    r = call('GET', f'/organizations/members/{MARK}/statement?from={day(-20)}&to={day(-1)}', tok['niamh.brennan'])
    check('statement: refused to somebody without labour cost (403)', r[0] == 403, r)
    r = call('GET', f'/organizations/members/{MARK}/statement?from=2026-02-30', ADMIN)
    check('statement: an impossible day is a 400', r[0] == 400, r)

    # ── Rate history: read with the right to write it; cost only for cost ───
    q = f'/rate-history?target=ASSIGNMENT&targetId={mid}&spaceId={space}'
    h = data(call('GET', q, ADMIN))
    check('history: an admin sees bill AND cost rows, dated',
          [(x['kind'], x['cents']) for x in h if x['kind'] == 'BILL_HOUR'] == [('BILL_HOUR', 8500), ('BILL_HOUR', 9000), ('BILL_HOUR', 9000)]
          and any(x['kind'] == 'COST_HOUR' for x in h), h)
    hm = data(call('GET', q, tok['niamh.brennan']))
    check('history: a workspace manager sees bill rows only', hm and all(x['kind'] == 'BILL_HOUR' for x in hm), hm)
    r = call('GET', q, tok['tobias.okafor'])
    check('history: refused to a member who does not manage the workspace (403)', r[0] == 403, r)
    r = call('GET', f'/rate-history?target=ASSIGNMENT&targetId={mid}&spaceId=video-space-depot', ADMIN)
    check('history: an assignment read through another workspace finds nothing (404)', r[0] == 404, r)
    r = call('GET', f"/rate-history?target=ORGANIZATION&targetId={ORG}", tok['niamh.brennan'])
    check('history: the organization default is the owner\'s (403)', r[0] == 403, r)

    # ── A role's default day rate, for workspaces without their own ─────────
    r = call('PUT', f"/space-roles/{elec['id']}/day-rate", ADMIN, {'cents': 15000})
    check('a default day rate for every workspace is saved', r[0] in (200, 201), r)
    roles = {x['id']: x for x in data(call('GET', f'/spaces/{space}/roles', ADMIN))}
    e = roles[elec['id']]
    check('…the workspace keeps its own 180, and shows the default beside it',
          e['dayRateCents'] == 18000 and e['dayRateSource'] == 'workspace' and e['defaultDayRateCents'] == 15000, e)
    call('PUT', f"/spaces/{space}/roles/{elec['id']}/day-rate", ADMIN, {'cents': None, 'effectiveFrom': day(-30)})
    roles = {x['id']: x for x in data(call('GET', f'/spaces/{space}/roles', ADMIN))}
    check('…clearing the workspace rate falls back to the default', roles[elec['id']]['dayRateCents'] == 15000
          and roles[elec['id']]['dayRateSource'] == 'default', roles[elec['id']])
    gd = data(call('GET', f'/invoices/gather?spaceId={space}&from={day(-20)}&to={day(-1)}', ADMIN))
    check('…and Ahmed\'s days are priced at the default', (AHMED, 3, 15000) in [(d['workerId'], d['days'], d['dayRateCents']) for d in gd['dayEntries']], gd['dayEntries'])
    call('PUT', f"/spaces/{space}/roles/{elec['id']}/day-rate", ADMIN, {'cents': 18000, 'effectiveFrom': day(-30)})

    # ── A member's own cost rate saves (it was refused by validation before) ─
    r = call('PATCH', f'/employees/{MARK}', ADMIN, {'costRateCents': 2700})
    check('a member\'s cost rate saves from the member screen', r[0] == 200, r)
    r = call('PATCH', f'/employees/{MARK}', tok['niamh.brennan'], {'costRateCents': 1})
    check('…but not by somebody without labour cost', r[0] == 403, r)

    # ── What the days COST: counted hours × cost rate, each day ─────────────
    by = {(d['workerId'], d['dayRateCents']): d for d in g['dayEntries']}
    check('a day with no cost rate anywhere is unknown, not free', by[(PATRICK, 20000)].get('costCents') is None, by[(PATRICK, 20000)])
    call('PATCH', f'/employees/{PATRICK}', ADMIN, {'costRateCents': 3000})
    gc = data(call('GET', f'/invoices/gather?spaceId={space}&from={day(-20)}&to={day(-1)}', ADMIN))
    byc = {(d['workerId'], d['dayRateCents']): d for d in gc['dayEntries']}
    # Before the raise: 8h + 3h (a job, no clock-in) + 2×8h (two shifts one day) + 8h + 8h = 43h × €30.
    check('day cost = counted hours × cost rate (43h × €30 = €1,290)', byc[(PATRICK, 20000)].get('costCents') == 129000, byc[(PATRICK, 20000)])
    check('…after the raise: 8h + 8h + 5h (job) + 8h = 29h × €30 = €870', byc[(PATRICK, 22000)].get('costCents') == 87000, byc[(PATRICK, 22000)])
    r = call('GET', f'/invoices/gather?spaceId={space}&from={day(-20)}&to={day(-1)}', tok['niamh.brennan'])
    check('day cost never reaches somebody without labour cost', r[0] != 200 or 'costCents' not in json.dumps(r[1]), r[0])

    # ── The statement says what the margin says ─────────────────────────────
    sp = data(call('GET', f'/organizations/members/{PATRICK}/statement?from={day(-20)}&to={day(-1)}', ADMIN))
    margin_days = sum(d.get('costCents') or 0 for d in gc['dayEntries'] if d['workerId'] == PATRICK)
    here = [l for l in sp['lines'] if l['spaceId'] == space]
    check('statement for a day-billed person = the margin\'s cost of their days (€2,160)',
          sum(l['amountCents'] for l in here) == margin_days == 216000, (here, margin_days))
    # His cost rate did not change, so his days are one line — split only where HIS rate changes.
    check('…as one run at his cost rate: 9 days, 72h × €30',
          [(l.get('days'), l['hours'], l['rateCents']) for l in here] == [(9, 72, 3000)], here)

    # ── Invoice the days: never billed twice ─────────────────────────────────
    pd = [d for d in g['dayEntries'] if d['workerId'] == PATRICK]
    items = [{'description': 'Mechanic', 'quantity': 0, 'unitPrice': 0, 'lineKind': 'HEADING'}] + [
        {'description': f"Patrick · {d['days']} days", 'quantity': d['days'], 'unitPrice': d['dayRateCents'] / 100,
         'lineKind': 'DAYS', 'billedDays': d['days'], 'workerId': PATRICK, 'dayFrom': d['fromDay'], 'dayTo': d['toDay'],
         'billRateCents': d['dayRateCents']} for d in pd]
    s, b = call('POST', '/invoices', ADMIN, {'spaceId': space, 'clientName': 'BILLA', 'servicePeriodFrom': day(-20), 'servicePeriodTo': day(-1), 'items': items})
    check('an invoice with day lines is created', s in (200, 201), b)
    inv = data((s, b))
    check('it adds up: 5×200 + 4×220 = 1,880', abs((inv.get('subtotal') or 0) - 1880) < 0.001, inv.get('subtotal'))
    check('the heading row charges nothing and keeps its kind',
          any(i.get('lineKind') == 'HEADING' and i['amount'] == 0 for i in inv['items']), inv['items'])
    g2 = data(call('GET', f'/invoices/gather?spaceId={space}&from={day(-20)}&to={day(-1)}', ADMIN))
    check('Patrick\'s invoiced days are not offered again', all(d['workerId'] != PATRICK for d in g2['dayEntries']), g2['dayEntries'])
    check('Ahmed\'s days are still offered', any(d['workerId'] == AHMED for d in g2['dayEntries']), g2['dayEntries'])
    s, b = call('POST', '/invoices', ADMIN, {'spaceId': space, 'clientName': 'X', 'items': [
        {'description': 'x', 'quantity': 1, 'unitPrice': 1, 'lineKind': 'DAYS', 'workerId': 'not-in-this-org', 'dayFrom': day(-3), 'dayTo': day(-3)}]})
    check('a day line naming somebody outside the organization is refused', s == 400, (s, b))
    call('DELETE', f"/invoices/{inv['id']}", ADMIN)
    g3 = data(call('GET', f'/invoices/gather?spaceId={space}&from={day(-20)}&to={day(-1)}', ADMIN))
    check('deleting the draft releases the days', sum(d['days'] for d in g3['dayEntries'] if d['workerId'] == PATRICK) == 9, g3['dayEntries'])

    if KEEP: raise SystemExit(0)
    # ── The past never moves ─────────────────────────────────────────────────
    call('PUT', f'/spaces/{space}/roles/{mech["id"]}/day-rate', ADMIN, {'cents': 99900})
    g4 = data(call('GET', f'/invoices/gather?spaceId={space}&from={day(-20)}&to={day(-1)}', ADMIN))
    check('a raise TODAY leaves every earlier day at its own rate',
          sorted((d['days'], d['dayRateCents']) for d in g4['dayEntries'] if d['workerId'] == PATRICK) == [(4, 22000), (5, 20000)], g4['dayEntries'])
finally:
    if not KEEP:
        reset_member_costs()
    if KEEP:
        print(f'kept: workspace {space}')
    elif space:
        psql(f"""
        delete from invoice_items where "invoiceId" in (select id from invoices where "spaceId"='{space}');
        delete from invoices where "spaceId"='{space}';
        delete from service_reports where "taskId" in (select id from tasks where "spaceId"='{space}');
        delete from tasks where "spaceId"='{space}';
        delete from time_entries where "locationId"='{space}';
        delete from rate_history where "targetId"='{space}' or "spaceId"='{space}'
          or "targetId" in (select id from space_assignments where "spaceId"='{space}');
        delete from space_assignments where "spaceId"='{space}';
        delete from company_locations where id='{space}';
        """)
    if made_roles and not KEEP:
        ids = ','.join(f"'{i}'" for i in made_roles)
        psql(f'delete from rate_history where "targetId" in ({ids}); delete from roles where id in ({ids});')
    print('cleaned up')

print(f'\n{fails} failure(s)')
sys.exit(fails)
