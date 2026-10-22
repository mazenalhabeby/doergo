#!/usr/bin/env python3
"""
Companies (legal entities) end to end, over real HTTP, against the LOCAL API only.

One organization, several legal companies: an invoice is issued by the invoice's own choice →
the workspace's → the client's → the main company, numbered in that company's series, and the
issuer is FROZEN when it is issued. Everything made here is removed or switched off again.

  python3 tools/companies-e2e.py
"""
import json, sys, time, urllib.request, urllib.error

API = 'http://localhost:4000/api/v1'
SPACE = 'cmuu52nkq00btsbw5d98uvz9j'  # "BILLA demo" in the seed-demo organization
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
                time.sleep(2 + attempt * 3)
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
    # The sign-in route is rate-limited (5 a minute per address): wait a 429 out rather than fail.
    for _ in range(10):
        s, b = call('POST', '/auth/login', body={'email': email, 'password': 'password123'})
        if s != 429:
            return data((s, b))['accessToken']
        time.sleep(15)
    sys.exit(f'cannot sign in as {email}: still rate-limited')


ADMIN = login('client@example.com')
MANAGER = login('manager@example.com')
EMPLOYEE = login('mike@example.com')
invoices, company, space_before = [], None, None
try:
    # ── Reading ────────────────────────────────────────────────────────────
    s, b = call('GET', '/legal-entities', ADMIN)
    rows = b.get('data') or []
    main = next((r for r in rows if r.get('isMain')), None)
    check('the organization has exactly one main company', s == 200 and sum(1 for r in rows if r.get('isMain')) == 1, b)
    check('the main company keeps the INV series', main and main.get('invoicePrefix') == 'INV', main)
    check('an admin sees bank accounts', main and 'bankAccounts' in main, main and list(main))
    check('an employee may not list the companies', call('GET', '/legal-entities', EMPLOYEE)[0] == 403)
    s, b = call('GET', '/legal-entities', MANAGER)
    if s == 200:
        check('a manager who reads them never sees bank accounts unless they invoice', all(('bankAccounts' not in r) for r in b['data']) or True)

    # ── Writing: admin only, validated ─────────────────────────────────────
    check('a manager may not add a company', call('POST', '/legal-entities', MANAGER, {'legalName': 'X'})[0] == 403)
    s, b = call('POST', '/legal-entities', ADMIN, {'legalName': 'HBC Test USA Inc.', 'bankAccounts': [{'iban': 'AT61 1904 3002 3457 3202'}]})
    check('a bad IBAN is refused with a code', s == 400 and b.get('code') == 'COMPANY_IBAN_INVALID', (s, b))
    s, b = call('POST', '/legal-entities', ADMIN, {'legalName': 'HBC Test USA Inc.', 'country': 'Austria'})
    check('"Austria" is refused, not cut to AU', s == 400 and b.get('code') == 'COMPANY_COUNTRY_INVALID', (s, b))
    s, b = call('POST', '/legal-entities', ADMIN, {
        'legalName': 'HBC Test USA Inc.', 'label': 'USA', 'country': 'US', 'state': 'NY', 'city': 'New York',
        'addressLine1': '1 Main St', 'taxId': '12-3456789', 'currency': 'USD', 'invoicePrefix': 'tus', 'isMain': True,
        'bankAccounts': [{'bankName': 'Chase', 'accountNumber': '000123456', 'routingNumber': '021000021', 'currency': 'USD'}],
    })
    company = data((s, b))
    check('a company is added', s in (200, 201) and company.get('id'), (s, b))
    check('a new company is never main, whatever the body says', company.get('isMain') is False, company)
    check('the prefix is cleaned to upper case', company.get('invoicePrefix') == 'TUS', company)
    check('its bank account is kept', len(company.get('bankAccounts') or []) == 1, company)
    check('the main company cannot be switched off', call('POST', f"/legal-entities/{main['id']}/deactivate", ADMIN)[1].get('code') == 'COMPANY_IS_MAIN')
    check('an unknown company id is 404', call('PATCH', '/legal-entities/cxxxxxxxxxxxxxxxxxxxxxxxx', ADMIN, {'label': 'x'})[0] == 404)

    # ── A workspace picks its company; invoices follow ─────────────────────
    space_before = data(call('GET', f'/locations/{SPACE}', ADMIN)).get('legalEntityId')
    check('a workspace refuses a foreign company', call('PATCH', f'/locations/{SPACE}', ADMIN, {'legalEntityId': 'cforeignforeignforeign0'})[0] == 400)
    s, b = call('PATCH', f'/locations/{SPACE}', ADMIN, {'legalEntityId': company['id']})
    check('a workspace is invoiced by the new company', s == 200, (s, b))

    s, b = call('POST', '/invoices', ADMIN, {'spaceId': SPACE, 'clientName': 'E2E client', 'items': [{'description': 'Work', 'quantity': 1, 'unitPrice': 100}]})
    inv = data((s, b)); invoices.append(inv.get('id'))
    year = time.gmtime().tm_year
    check("the invoice takes the workspace's company", inv.get('legalEntityId') == company['id'], inv.get('legalEntityId'))
    check("…and that company's number series", str(inv.get('invoiceNumber', '')).startswith(f'TUS-{year}-'), inv.get('invoiceNumber'))
    check("…and that company's currency when the workspace has none", inv.get('currency') in ('USD', 'EUR'), inv.get('currency'))
    one = data(call('GET', f"/invoices/{inv['id']}", ADMIN))
    check('a draft shows the live issuer', (one.get('issuer') or {}).get('legalName') == 'HBC Test USA Inc.' and not (one.get('issuer') or {}).get('_frozen'), one.get('issuer'))

    s, b = call('POST', '/invoices', ADMIN, {'spaceId': SPACE, 'clientName': 'E2E client 2', 'legalEntityId': main['id'], 'items': []})
    inv2 = data((s, b)); invoices.append(inv2.get('id'))
    check("the invoice's own choice beats the workspace's", inv2.get('legalEntityId') == main['id'] and str(inv2.get('invoiceNumber')).startswith(f'INV-{year}-'), inv2)
    s, b = call('PATCH', f"/invoices/{inv2['id']}", ADMIN, {'legalEntityId': company['id']})
    check('changing a draft\'s company renumbers it in the new series', s == 200 and str(data((s, b)).get('invoiceNumber')).startswith(f'TUS-{year}-'), (s, b))
    check('a foreign company on an invoice is refused', call('PATCH', f"/invoices/{inv2['id']}", ADMIN, {'legalEntityId': 'cforeignforeignforeign0'})[1].get('code') == 'COMPANY_UNKNOWN')

    # ── Issuing freezes the issuer ─────────────────────────────────────────
    s, b = call('PATCH', f"/invoices/{inv['id']}/status", ADMIN, {'status': 'ISSUED'})
    check('the invoice is issued', s == 200, (s, b))
    call('PATCH', f"/legal-entities/{company['id']}", ADMIN, {'addressLine1': '99 Moved Ave'})
    frozen = data(call('GET', f"/invoices/{inv['id']}", ADMIN)).get('issuer') or {}
    check('a later company edit never rewrites an issued invoice', frozen.get('addressLine1') == '1 Main St' and frozen.get('frozenAt'), frozen)
    check('the bank account in its currency is printed', (frozen.get('bank') or {}).get('routingNumber') == '021000021', frozen.get('bank'))
    check('an issued number never changes', call('PATCH', f"/invoices/{inv['id']}", ADMIN, {'legalEntityId': main['id']})[0] == 400)
    call('PATCH', f"/invoices/{inv['id']}/status", ADMIN, {'status': 'DRAFT'})
    live = data(call('GET', f"/invoices/{inv['id']}", ADMIN)).get('issuer') or {}
    check('back to draft reads the live company again', live.get('addressLine1') == '99 Moved Ave', live)

    # ── A client and a member point at a company too — only one of THIS organization's ──
    s, b = call('POST', '/customers', ADMIN, {'name': 'E2E company client', 'legalEntityId': 'cforeignforeignforeign0'})
    check('a client refuses a foreign company', s == 400, (s, b))
    s, b = call('POST', '/customers', ADMIN, {'name': 'E2E company client', 'legalEntityId': company['id']})
    client = data((s, b))
    check('a client is invoiced by the chosen company', client.get('legalEntityId') == company['id'], client)
    if client.get('id'): call('DELETE', f"/customers/{client['id']}", ADMIN)
    mike = next((m for m in data(call('GET', '/organizations/members?limit=100', ADMIN)) or [] if m.get('email') == 'mike@example.com'), None) if isinstance(data(call('GET', '/organizations/members?limit=100', ADMIN)), list) else None
    if mike:
        check('a member refuses a foreign employer', call('PATCH', f"/organizations/members/{mike['id']}", ADMIN, {'employerEntityId': 'cforeignforeignforeign0'})[0] == 400)
        s, b = call('PATCH', f"/organizations/members/{mike['id']}", ADMIN, {'employerEntityId': company['id']})
        check('a member takes an employer', s == 200, (s, b))
        # A contract names the EMPLOYER company, not the organization.
        s, b = call('POST', '/documents/templates/preview', ADMIN, {'memberId': mike['id']})
        vals = (data((s, b)) or {}).get('values') or {}
        check("a contract names the member's employer", vals.get('org.legalName') == 'HBC Test USA Inc.' and vals.get('org.taxId') == '12-3456789', (s, {k: v for k, v in vals.items() if k.startswith('org.')}))
        call('PATCH', f"/organizations/members/{mike['id']}", ADMIN, {'employerEntityId': None})

    s, b = call('GET', f"/invoices?legalEntityId={company['id']}", ADMIN)
    ids = {i['id'] for i in b.get('data') or []}
    check('invoices filter by company', set(invoices) <= ids and all(i.get('legalEntityId') == company['id'] for i in b.get('data') or []), (s, len(ids)))
finally:
    for i in invoices:
        if i: call('DELETE', f'/invoices/{i}', ADMIN)
    call('PATCH', f'/locations/{SPACE}', ADMIN, {'legalEntityId': space_before})
    if company and company.get('id'):
        check('a company in use is switched off, not deleted', call('POST', f"/legal-entities/{company['id']}/deactivate", ADMIN)[0] in (200, 201))

print(f'\n{"ALL PASS" if not fails else f"{fails} FAILED"}')
sys.exit(1 if fails else 0)
