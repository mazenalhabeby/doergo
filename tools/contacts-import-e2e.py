#!/usr/bin/env python3
"""
Clients from a phone's address book, end to end, over real HTTP, against the LOCAL API only.

The phone hashes its contacts' keys and compares them with the hashes the server sends
(`GET /customers/match-keys`), then sends only the ticked people (`POST /customers/import`).
The server matches again, never overwrites, links people to their company, and records
where every client came from. Everything made here is deleted again at the end.

  python3 tools/contacts-import-e2e.py
"""
import hashlib, json, subprocess, sys, time, urllib.request, urllib.error, uuid

API = 'http://localhost:4000/api/v1'
fails = 0
made = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                time.sleep(15)  # the import is limited to 10 a minute per member — wait it out
                continue
            try: return e.code, json.loads(e.read() or b'{}')
            except Exception: return e.code, {}


def data(r):
    s, b = r
    return b.get('data', b) if isinstance(b, dict) else b


def check(name, ok, detail=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  → {detail}'))
    if not ok: fails += 1


def login(email):
    return data(call('POST', '/auth/login', body={'email': email, 'password': 'password123'}))


def ref():
    return str(uuid.uuid4())


def h(org, key):
    return hashlib.sha256(f'hbc-match:{org}:{key}'.encode()).hexdigest()[:20]


def psql(sql):
    name = subprocess.run(['docker', 'ps', '--format', '{{.Names}}'], capture_output=True, text=True).stdout.split()
    pg = next(n for n in name if 'postgres' in n.lower())
    return subprocess.run(['docker', 'exec', pg, 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-tAc', sql], capture_output=True, text=True).stdout.strip()


admin = login('client@example.com')
ADMIN, ORG = admin['accessToken'], admin['user']['organizationId']
EMPLOYEE = login('mike@example.com')['accessToken']
stamp = str(int(time.time()))[-6:]
phone_a = f'+43 664 7{stamp}0'          # written one way on the phone…
phone_a_crm = f'0664 7{stamp}0'          # …another way in the CRM

try:
    spaces = [s for s in data(call('GET', '/locations', ADMIN)) if 'crm' in (s.get('enabledModules') or [])]
    check('a workspace runs CRM', bool(spaces), 'enable CRM on one workspace first')
    SPACE = spaces[0]['id']

    # ── An existing client, saved with the number written differently ──
    s, b = call('POST', '/customers', ADMIN, {'name': f'E2E Gruber {stamp}', 'phone': phone_a_crm, 'spaceId': SPACE, 'type': 'PERSON'})
    existing = data((s, b)); made.append(existing['id'])
    check('an existing client is made', s in (200, 201), (s, b))

    # ── Match keys: hashes, never numbers ──
    s, b = call('GET', '/customers/match-keys', ADMIN)
    keys = data((s, b))
    digits = ''.join(ch for ch in phone_a if ch.isdigit())[-9:]
    check('match keys come back', s == 200 and isinstance(keys.get('hashes'), list), (s, b))
    check('the existing client is among them, hashed the way the phone hashes', h(ORG, digits) in keys['hashes'])
    check('no plain number leaves the server', digits not in json.dumps(b))
    check('an employee without CRM may not read them', call('GET', '/customers/match-keys', EMPLOYEE)[0] in (403, 404))

    # ── Refusals before anything is written ──
    check('an empty import is refused with a code', call('POST', '/customers/import', ADMIN, {'spaceId': SPACE, 'items': []})[1].get('code') == 'CONTACT_IMPORT_NO_ITEMS')
    check('a person tied to a company outside the batch is refused',
          call('POST', '/customers/import', ADMIN, {'spaceId': SPACE, 'items': [{'ref': ref(), 'kind': 'PERSON', 'name': 'X', 'companyRef': ref()}]})[1].get('code') == 'CONTACT_IMPORT_BAD_COMPANY_REF')
    check('201 contacts are refused', call('POST', '/customers/import', ADMIN, {'spaceId': SPACE, 'items': [{'ref': ref(), 'kind': 'PERSON', 'name': f'P{i}'} for i in range(201)]})[1].get('code') == 'CONTACT_IMPORT_TOO_MANY')
    check('an employee without CRM may not import', call('POST', '/customers/import', EMPLOYEE, {'spaceId': SPACE, 'items': [{'ref': ref(), 'kind': 'PERSON', 'name': 'X'}]})[0] in (403, 404))

    # ── The import ──
    co, p1, p2, dup1, dup2, old = ref(), ref(), ref(), ref(), ref(), ref()
    body = {'spaceId': SPACE, 'items': [
        {'ref': p1, 'kind': 'PERSON', 'name': f'E2E Thomas {stamp}', 'email': f't{stamp}@bauer-e2e.at', 'role': 'Site manager', 'companyRef': co},
        {'ref': co, 'kind': 'COMPANY', 'name': f'E2E Bauer GmbH {stamp}', 'email': f'office{stamp}@bauer-e2e.at'},
        {'ref': p2, 'kind': 'PERSON', 'name': f'E2E Anna {stamp}', 'email': f'a{stamp}@bauer-e2e.at', 'companyRef': co},
        {'ref': dup1, 'kind': 'PERSON', 'name': f'E2E Julia {stamp}', 'email': f'J{stamp}@Brandl-e2e.at'},
        {'ref': dup2, 'kind': 'PERSON', 'name': f'E2E Julia B {stamp}', 'email': f'j{stamp}@brandl-e2e.at '},
        {'ref': old, 'kind': 'PERSON', 'name': 'Paul (phone)', 'phone': phone_a, 'email': f'paul{stamp}@gruber-e2e.at', 'fillMissing': True},
    ]}
    s, b = call('POST', '/customers/import', ADMIN, body)
    r = data((s, b))
    made.extend([co, p1, p2, dup1])
    by = {x['ref']: x for x in r.get('results', [])}
    check('the import lands', s in (200, 201), (s, b))
    check('four new clients, one duplicate left out, one existing filled', (r.get('created'), r.get('skipped'), r.get('filled')) == (4, 1, 1), r)
    check('the second Julia is the same person twice', by.get(dup2, {}).get('reason') == 'DUPLICATE_IN_BATCH', by.get(dup2))
    check('Paul matched the CRM client though his number is written differently', by.get(old, {}).get('id') == existing['id'], by.get(old))
    check('the people are linked to their company', by.get(p1, {}).get('companyId') == co and by.get(p2, {}).get('companyId') == co, (by.get(p1), by.get(p2)))

    contacts = data(call('GET', f'/customers/{co}/contacts', ADMIN))
    roles = {c['person']['id']: c for c in contacts}
    check('the company lists both as contact people', set(roles) == {p1, p2}, contacts)
    check('the first one is the primary and keeps their job', roles.get(p1, {}).get('isPrimary') is True and roles[p1].get('role') == 'Site manager', roles.get(p1))
    check('contact people are not billable clients', psql(f"select string_agg(\"isContact\"::text, ',' order by id) from customers where id in ('{p1}','{p2}')") == 'true,true')

    paul = data(call('GET', f'/customers/{existing["id"]}', ADMIN))
    check('an empty email was added to the existing client', paul.get('email') == f'paul{stamp}@gruber-e2e.at', paul)
    check('his phone was NOT overwritten', paul.get('phone') == phone_a_crm, paul)
    check('the match keys follow the fill', psql(f"select \"emailKey\" from customers where id='{existing['id']}'") == f'paul{stamp}@gruber-e2e.at')

    acts = data(call('GET', f'/customers/{co}/activities', ADMIN))
    check('every new client says where it came from',
          any((a.get('metadata') or {}).get('source') == 'PHONE_CONTACTS' for a in (acts if isinstance(acts, list) else acts.get('items', []))), acts)
    audit = psql("select metadata::text from activity_logs where \"eventType\"='CLIENTS_IMPORTED_FROM_PHONE' order by \"createdAt\" desc limit 1")
    check('the audit log records the import WITHOUT the contacts', bool(audit) and 'bauer-e2e' not in audit and '"contacts": 6' in audit, audit)

    # ── The same import again is the same import ──
    s, b = call('POST', '/customers/import', ADMIN, body)
    r2 = data((s, b))
    # Five: the four imported and the client made at the start. Nothing doubled.
    check('a retried import creates nothing new', s in (200, 201) and psql(f"select count(*) from customers where name like 'E2E % {stamp}'") == '5', (r2, psql(f"select count(*) from customers where name like 'E2E % {stamp}'")))
    check('…and reports the same clients', all(by[k].get('id') == x.get('id') for x in r2.get('results', []) for k in [x['ref']] if by.get(k, {}).get('outcome') == 'created'), r2)
finally:
    if made:
        ids = "','".join(made)
        psql(f"delete from customer_contacts where \"companyId\" in ('{ids}') or \"personId\" in ('{ids}')")
        psql(f"delete from customer_activities where \"customerId\" in ('{ids}')")
        psql(f"delete from customers where id in ('{ids}')")
        print(f'cleaned up {len(made)} records')

print(f'\n{"ALL PASS" if not fails else f"{fails} FAILED"}')
sys.exit(1 if fails else 0)
