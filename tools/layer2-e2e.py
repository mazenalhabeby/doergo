#!/usr/bin/env python3
"""
Layer 2 — the organization and its workspaces, over real HTTP. LOCAL ONLY (creates test workspaces and removes them).

  python3 tools/layer2-e2e.py

A. A workspace's life: create → rename → default (exactly one, always) → archive; an archived workspace takes no new
   job, member or client; Remote is never the default and never archived; the default is never archived.
B. A module switched off in one workspace: writes refused (402), reads still answer, another workspace unaffected,
   switched on again works — and how long each change takes to arrive.
C. An Option (bought once for the company) switched off: its writes refused at once, its reads still answer; back on.
D. Company value, workspace value: a new workspace starts with the standard modules of its own (modules live on
   workspaces), its currency follows the company's until it sets one, its time zone comes from its pin on the map
   (a New York pin → New York time) and, with no pin, from the company.
E. The bill: a module switched on in a workspace adds exactly its price, and taking it off removes exactly that.
F. Who may change what: a leader of one workspace, a plain employee — never another workspace, the company's Options,
   its profile or its default.
G. Speed with many workspaces: 50 created in a throwaway organization, the workspace list and the bill timed.
"""
import json, os, re, subprocess, sys, time, urllib.error, urllib.request, uuid

B = os.environ.get('API', 'http://localhost:4000/api/v1')
if not re.match(r'^http://(localhost|127\.0\.0\.1)(:\d+)?/', B):
    sys.exit('local only')
FAILED = []
TAG = 'L2 test ' + uuid.uuid4().hex[:5]


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  → {str(detail)[:400]}' if not ok and detail != '' else ''))
    if not ok:
        FAILED.append(name)


def sql(q):
    return subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-Atc', q],
                          capture_output=True, text=True).stdout.strip()


def unthrottle():
    subprocess.run(['docker', 'exec', 'hbcfield-redis', 'sh', '-c',
                    "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del"], capture_output=True)


def call(method, path, token=None, body=None):
    h = {'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {})}
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers=h)
    try:
        r = urllib.request.urlopen(req, timeout=60)
        raw = r.read()
        s = r.status
    except urllib.error.HTTPError as e:
        raw, s = e.read(), e.code
    try:
        b = json.loads(raw or b'null')
    except ValueError:
        b = None
    if s == 429:
        unthrottle()
        return call(method, path, token, body)
    return s, (b.get('data', b) if isinstance(b, dict) else b)


def login(email, password='password123'):
    unthrottle()
    s, d = call('POST', '/auth/login', body={'email': email, 'password': password})
    assert s in (200, 201), f'login {email}: {s}'
    return d['accessToken'], d['user']['id']


def refused(s):
    return s in (400, 402, 403, 404, 409, 422)


def until(fn, limit=45, step=2):
    """Seconds until fn() is true (None = never within the limit)."""
    t0 = time.time()
    while time.time() - t0 < limit:
        if fn():
            return round(time.time() - t0, 1)
        time.sleep(step)
    return None


OWNER, OWNER_ID = login('client@example.com')
ORG = sql(f"select \"organizationId\" from users where id='{OWNER_ID}'")
created = []

try:
    # ── A. a workspace's life ───────────────────────────────────────────────────────────────────────────────────────
    print('\n── A. a workspace\'s life')
    s, w = call('POST', '/locations', OWNER, {'name': TAG, 'lat': 47.98, 'lng': 13.82, 'timezone': 'Europe/Vienna'})
    check('the owner creates a workspace', s in (200, 201) and w and w.get('id'), (s, w))
    W = w['id']
    created.append(W)
    s, _ = call('PATCH', f'/locations/{W}', OWNER, {'name': TAG + ' renamed'})
    check('…renames it', s == 200 and sql(f"select name from company_locations where id='{W}'") == TAG + ' renamed', s)
    was_default = sql(f"select id from company_locations where \"organizationId\"='{ORG}' and \"isDefault\"")
    s, _ = call('POST', f'/locations/{W}/default', OWNER)
    defaults = sql(f"select id from company_locations where \"organizationId\"='{ORG}' and \"isDefault\"").split('\n')
    check('…makes it the default — exactly one default afterwards', s in (200, 201) and defaults == [W], (s, defaults))
    s, _ = call('DELETE', f'/locations/{W}', OWNER)
    check('the default workspace cannot be archived', refused(s), s)
    call('POST', f'/locations/{was_default}/default', OWNER)
    defaults = sql(f"select id from company_locations where \"organizationId\"='{ORG}' and \"isDefault\"").split('\n')
    check('…and the default moves back — still exactly one', defaults == [was_default], defaults)
    remote = sql(f"select id from company_locations where \"organizationId\"='{ORG}' and name='Remote' limit 1")
    if remote:
        check('Remote can never be the default', refused(call('POST', f'/locations/{remote}/default', OWNER)[0]))
        check('Remote can never be archived', refused(call('DELETE', f'/locations/{remote}', OWNER)[0]))
    s, w2 = call('POST', '/locations', OWNER, {'name': TAG + ' archived', 'lat': 47.9, 'lng': 13.8})
    W2 = w2['id']
    created.append(W2)
    s, _ = call('DELETE', f'/locations/{W2}', OWNER)
    check('a workspace is archived', s in (200, 204) and sql(f"select \"isActive\" from company_locations where id='{W2}'") == 'f', s)
    noor = sql("select id from users where email='noor@example.com'")
    s, b = call('POST', '/tasks', OWNER, {'title': TAG + ' job', 'spaceId': W2})
    check('an archived workspace takes no new job', refused(s), (s, b))
    s, b = call('POST', f'/locations/{W2}/members', OWNER, {'userId': noor})
    check('…no new member', refused(s), (s, b))
    s, b = call('POST', '/customers', OWNER, {'name': TAG + ' client', 'type': 'COMPANY', 'spaceId': W2})
    check('…no new client', refused(s), (s, b))

    # ── B. a module switched off in one workspace ───────────────────────────────────────────────────────────────────
    print('\n── B. a module switched off in one workspace')
    on = ['subtasks', 'checklists', 'attachments', 'tracking', 'service_reports', 'time_tracking']
    call('PATCH', f'/locations/{W}', OWNER, {'enabledModules': on})
    s, t = call('POST', '/tasks', OWNER, {'title': TAG + ' job', 'spaceId': W})
    check('a job in the test workspace', s in (200, 201) and t and t.get('id'), (s, t))
    T = t['id']
    other_task = sql(f"select t.id from tasks t join company_locations c on c.id=t.\"spaceId\" where t.\"organizationId\"='{ORG}' and c.\"enabledModules\"::jsonb ? 'checklists' and t.\"spaceId\"<>'{W}' and t.status not in ('COMPLETED','CLOSED','CANCELED') limit 1")
    s, _ = call('POST', f'/tasks/{T}/checklist', OWNER, {'text': 'L2 item'})
    check('with "checklists" on, a checklist item is added', s in (200, 201), s)
    call('PATCH', f'/locations/{W}', OWNER, {'enabledModules': [m for m in on if m != 'checklists']})
    took = until(lambda: call('POST', f'/tasks/{T}/checklist', OWNER, {'text': 'L2 refused'})[0] == 402)
    check('switched off: adding a checklist item is refused (402)', took is not None, 'still allowed after 45 s')
    if took is not None:
        print(f'      took {took} s to arrive (the module cache is 30 s)')
    s, job = call('GET', f'/tasks/{T}', OWNER)
    check('…reading the job and its checklist still answers', s == 200 and isinstance(job, dict), s)
    if other_task:
        s, item = call('POST', f'/tasks/{other_task}/checklist', OWNER, {'text': 'L2 other workspace'})
        check('…another workspace is unaffected', s in (200, 201), s)
        iid = (item or {}).get('id') if isinstance(item, dict) else None
        if iid:
            call('DELETE', f'/tasks/{other_task}/checklist/{iid}', OWNER)
        sql(f"delete from checklist_items where \"taskId\"='{other_task}' and text='L2 other workspace'")
    call('PATCH', f'/locations/{W}', OWNER, {'enabledModules': on})
    took = until(lambda: call('POST', f'/tasks/{T}/checklist', OWNER, {'text': 'L2 back'})[0] in (200, 201))
    check('switched on again: it works', took is not None, 'still refused after 45 s')

    # ── C. an Option switched off for the company ───────────────────────────────────────────────────────────────────
    print('\n── C. an Option switched off for the company')
    before = json.loads(sql(f"select to_json(\"addOns\") from organizations where id='{ORG}'") or '[]')
    if 'recurring' in before:
        s, _ = call('PUT', '/billing/add-ons', OWNER, {'addOns': [a for a in before if a != 'recurring']})
        check('the owner switches "recurring" off', s == 200, s)
        took = until(lambda: call('POST', '/recurring-tasks', OWNER, {'title': 'L2'})[0] == 402, limit=20, step=1)
        check('its writes are refused (402)', took is not None, 'still let through after 20 s')
        if took is not None:
            print(f'      took {took} s to arrive (the session is dropped on change)')
        check('its list still answers (reads pass)', call('GET', '/recurring-tasks', OWNER)[0] == 200)
        s, _ = call('PUT', '/billing/add-ons', OWNER, {'addOns': before})
        after = json.loads(sql(f"select to_json(\"addOns\") from organizations where id='{ORG}'") or '[]')
        check('switched back on: exactly the Options it had', s == 200 and sorted(after) == sorted(before), (s, after))
    else:
        print('      skipped: the organization has no "recurring" Option')

    # ── D. company value, workspace value ───────────────────────────────────────────────────────────────────────────
    print('\n── D. company value, workspace value')
    s, w3 = call('POST', '/locations', OWNER, {'name': TAG + ' plain', 'lat': 47.95, 'lng': 13.81})
    W3 = w3['id']
    created.append(W3)
    s, m = call('GET', f'/locations/{W3}/modules', OWNER)
    std = ['attachments', 'checklists', 'service_reports', 'subtasks', 'time_tracking', 'tracking']
    check('modules: a new workspace starts with the standard set of its own', s == 200 and sorted(m.get('enabledModules', [])) == std, m)
    s, m = call('GET', f'/locations/{W}/modules', OWNER)
    check('…one that set its own uses its own', s == 200 and m.get('source') != 'organization'
          and 'checklists' in m.get('enabledModules', []), m)
    org_cur = sql(f"select currency from organizations where id='{ORG}'")
    check('currency: none of its own → the company\'s applies', sql(f"select currency from company_locations where id='{W3}'") == '', org_cur)
    call('PATCH', f'/locations/{W3}', OWNER, {'currency': 'USD'})
    check('…its own once set', sql(f"select currency from company_locations where id='{W3}'") == 'USD')
    call('PATCH', f'/locations/{W3}', OWNER, {'currency': None})
    check('…and back to the company\'s when cleared', sql(f"select currency from company_locations where id='{W3}'") == '')
    org_tz = sql(f"select timezone from organizations where id='{ORG}'")
    s, ny = call('POST', '/locations', OWNER, {'name': TAG + ' new york', 'lat': 40.7128, 'lng': -74.006})
    created.append(ny['id'])
    check('time zone: a pin in New York gives New York time',
          sql(f"select timezone from company_locations where id='{ny['id']}'") == 'America/New_York')
    s, nopin = call('POST', '/locations', OWNER, {'name': TAG + ' no pin', 'kind': 'INTERNAL'})
    if s in (200, 201):
        created.append(nopin['id'])
        got = sql(f"select timezone from company_locations where id='{nopin['id']}'")
        check(f'…no pin: the company\'s ({org_tz})', got == org_tz, got)

    # ── E. the bill ─────────────────────────────────────────────────────────────────────────────────────────────────
    print('\n── E. the bill')
    def total():
        s, b = call('GET', '/billing/bill', OWNER)
        return b.get('monthlyCents') if isinstance(b, dict) else None
    base = [m for m in std if m != 'tracking']
    call('PATCH', f'/locations/{W3}', OWNER, {'enabledModules': base})
    t0 = total()
    call('PATCH', f'/locations/{W3}', OWNER, {'enabledModules': base + ['tracking']})
    t1 = total()
    # The price the code itself charges (shared moduleMonthlyCents) — the bill must add exactly that.
    price = int(subprocess.run(['node', '-e', "process.stdout.write(String(require('@hbcfield/shared')"
                                ".moduleMonthlyCents('tracking')))"], capture_output=True, text=True,
                               cwd=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'apps/api/auth-service')).stdout or 0)
    check(f'switching a module on in a workspace adds exactly its price (€{price / 100:.2f})',
          price > 0 and t0 is not None and t1 is not None and t1 - t0 == price, (t0, t1, price))
    call('PATCH', f'/locations/{W3}', OWNER, {'enabledModules': base})
    t2 = total()
    check('…switching it off takes exactly that off again', t2 == t0, (t0, t2))

    # ── F. who may change what ──────────────────────────────────────────────────────────────────────────────────────
    print('\n── F. who may change what')
    MIKE, _ = login('mike@example.com')
    NOOR, _ = login('noor@example.com')
    main = '65902837-95b4-49d0-9468-14bfe06f2717'
    for who, tok in (('the leader of Main Office', MIKE), ('a plain employee', NOOR)):
        check(f'{who} cannot change another workspace', refused(call('PATCH', f'/locations/{W3}', tok, {'name': 'x'})[0]))
        check(f'{who} cannot switch another workspace\'s modules',
              refused(call('PATCH', f'/locations/{W3}', tok, {'enabledModules': ['tracking']})[0]))
        check(f'{who} cannot change the company\'s Options', refused(call('PUT', '/billing/add-ons', tok, {'addOns': []})[0]))
        check(f'{who} cannot change the company profile', refused(call('PATCH', '/organizations/profile', tok, {'name': 'x'})[0]))
        check(f'{who} cannot move the default', refused(call('POST', f'/locations/{main}/default', tok)[0]))
        check(f'{who} cannot create a workspace', refused(call('POST', '/locations', tok, {'name': 'x', 'lat': 1, 'lng': 1})[0]))
    check('nothing changed', sql(f"select name from company_locations where id='{W3}'") == TAG + ' plain')

    # ── G. speed with many workspaces ───────────────────────────────────────────────────────────────────────────────
    print('\n── G. speed with many workspaces (a throwaway organization)')
    SOLO, _ = login('e2e-solo-owner@example.test', 'E2eSolo2026')
    many = []
    for i in range(50):
        s, x = call('POST', '/locations', SOLO, {'name': f'L2 speed {i}', 'lat': 47 + i / 100, 'lng': 13})
        if s in (200, 201):
            many.append(x['id'])
    check('50 workspaces created', len(many) == 50, len(many))
    def timed(path):
        best = 9e9
        for _ in range(3):
            t = time.time()
            call('GET', path, SOLO)
            best = min(best, time.time() - t)
        return round(best * 1000)
    ms_list, ms_bill = timed('/locations'), timed('/billing/bill')
    print(f'      with {len(many) + 1} workspaces: list {ms_list} ms · bill {ms_bill} ms')
    check('the workspace list answers under 500 ms', ms_list < 500, ms_list)
    check('the bill answers under 1000 ms', ms_bill < 1000, ms_bill)
    for x in many:
        call('DELETE', f'/locations/{x}', SOLO)
        call('DELETE', f'/locations/{x}/permanent', SOLO)
    left = sql("select count(*) from company_locations where name like 'L2 speed %'")
    check('…and removed again', left == '0', left)
finally:
    for x in created:
        sql(f"delete from checklist_items where \"taskId\" in (select id from tasks where \"spaceId\"='{x}')")
        sql(f"delete from tasks where \"spaceId\"='{x}'")
        call('DELETE', f'/locations/{x}', OWNER)
        call('DELETE', f'/locations/{x}/permanent', OWNER)
    left = sql(f"select count(*) from company_locations where name like '{TAG}%'")
    print(f'\ncleanup: {left} test workspaces left')

print('\nALL PASSED' if not FAILED else f'\n{len(FAILED)} FAILED')
sys.exit(1 if FAILED else 0)
