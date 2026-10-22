#!/usr/bin/env python3
"""
Currencies end to end, over real HTTP, against the LOCAL API only.

The organization has a currency; a workspace and a client may have their own; an
invoice takes the workspace's, else the client's, else the organization's, and
keeps the ECB exchange rate of its issue day (or one typed in) so a margin reads
what it was worth then. Everything changed here is put back.

  python3 tools/currency-e2e.py
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
made = []
customer = None
try:
    prof = data(call('GET', '/organizations/profile', ADMIN))
    check('the organization starts in EUR', prof.get('currency') == 'EUR', prof.get('currency'))
    me = data(call('GET', '/auth/me', ADMIN))
    check('the session carries the organization\'s currency', me.get('orgCurrency') == 'EUR', me.get('orgCurrency'))

    # ── The organization's currency can never be empty or invented ───────────
    check('an empty organization currency is refused', call('PATCH', '/organizations/profile', ADMIN, {'currency': ''})[0] == 400)
    check('an unknown currency is refused', call('PATCH', '/organizations/profile', ADMIN, {'currency': 'XXX'})[0] == 400)
    r = call('PATCH', '/organizations/profile', ADMIN, {'currency': 'gbp'})
    check('…a real one is saved, upper-cased', r[0] == 200 and data(r).get('currency') == 'GBP', r)
    check('…and the session reads it at once', data(call('GET', '/auth/me', ADMIN)).get('orgCurrency') == 'GBP')
    call('PATCH', '/organizations/profile', ADMIN, {'currency': 'EUR'})

    # ── A workspace bills in its own currency ────────────────────────────────
    check('an unknown workspace currency is refused', call('PATCH', f'/locations/{SPACE}', ADMIN, {'currency': 'ABC'})[0] == 400)
    r = call('PATCH', f'/locations/{SPACE}', ADMIN, {'currency': 'usd'})
    check('a workspace can bill in USD', r[0] == 200 and data(r).get('currency') == 'USD', r)
    loc = data(call('GET', f'/locations/{SPACE}', ADMIN))
    check('…its rates read in USD, its costs in the organization\'s EUR',
          loc.get('effectiveCurrency') == 'USD' and loc.get('organizationCurrency') == 'EUR', loc)
    check('…and it says how many rates a switch re-reads', isinstance(loc.get('ratesSet'), int), loc.get('ratesSet'))

    g = data(call('GET', f'/invoices/gather?spaceId={SPACE}&from=2026-09-01&to=2026-09-30', ADMIN))
    check('a workspace invoice starts in the workspace\'s currency',
          (g.get('currency'), g.get('currencySource'), g.get('baseCurrency')) == ('USD', 'workspace', 'EUR'),
          (g.get('currency'), g.get('currencySource'), g.get('baseCurrency')))

    # ── The ECB's rate ───────────────────────────────────────────────────────
    x = data(call('GET', '/invoices/exchange-rate?currency=USD&date=2026-10-04', ADMIN))
    check('the ECB rate for a Sunday is the Friday\'s', x.get('source') == 'ECB' and x.get('date') == '2026-10-02'
          and 0.5 < (x.get('rate') or 0) < 1.5, x)
    check('an unknown currency is a 400 here too', call('GET', '/invoices/exchange-rate?currency=XYZ', ADMIN)[0] == 400)
    check('a member without invoices may not ask', call('GET', '/invoices/exchange-rate?currency=USD', login('karim@example.com'))[0] == 403)

    # ── An invoice keeps its currency and its rate ───────────────────────────
    base = {'spaceId': SPACE, 'clientName': 'BILLA', 'issueDate': '2026-10-04',
            'items': [{'description': 'Work', 'quantity': 1, 'unitPrice': 100}]}
    r = call('POST', '/invoices', ADMIN, base)
    inv = data(r); made.append(inv.get('id'))
    check('no currency sent: the workspace\'s, with the ECB rate filled in',
          r[0] in (200, 201) and inv.get('currency') == 'USD' and inv.get('baseCurrency') == 'EUR'
          and inv.get('exchangeRateSource') == 'ECB' and inv.get('exchangeRate') == x.get('rate')
          and str(inv.get('exchangeRateDate', ''))[:10] == '2026-10-02', inv)
    r = call('POST', '/invoices', ADMIN, {**base, 'exchangeRate': '0,9', 'exchangeRateSource': 'MANUAL'})
    inv2 = data(r); made.append(inv2.get('id'))
    check('a typed rate is kept as typed', inv2.get('exchangeRate') == 0.9 and inv2.get('exchangeRateSource') == 'MANUAL', inv2)
    r = call('POST', '/invoices', ADMIN, {**base, 'exchangeRate': None})
    inv3 = data(r); made.append(inv3.get('id'))
    check('a rate cleared on purpose stays cleared (no margin)', inv3.get('exchangeRate') is None and inv3.get('exchangeRateSource') is None, inv3)
    check('a negative rate is refused', call('POST', '/invoices', ADMIN, {**base, 'exchangeRate': -1})[0] == 400)
    check('an invented currency is refused', call('POST', '/invoices', ADMIN, {**base, 'currency': 'XYZ'})[0] == 400)
    r = call('POST', '/invoices', ADMIN, {**base, 'currency': 'EUR'})
    inv4 = data(r); made.append(inv4.get('id'))
    check('in the organization\'s own currency: no rate at all', inv4.get('currency') == 'EUR' and inv4.get('exchangeRate') is None, inv4)
    r = call('PATCH', f"/invoices/{inv2['id']}", ADMIN, {'currency': 'CHF'})
    check('changing a draft\'s currency drops the old rate and asks the ECB again',
          data(r).get('currency') == 'CHF' and data(r).get('exchangeRateSource') == 'ECB' and data(r).get('exchangeRate') != 0.9, data(r))

    # ── A client's own currency, outside a workspace ─────────────────────────
    r = call('POST', '/customers', ADMIN, {'name': f'E2E Currency {int(time.time())}', 'currency': 'chf'})
    customer = data(r)
    check('a client saves its invoice currency', r[0] in (200, 201) and customer.get('currency') == 'CHF', r)
    check('…and an invented one is refused', call('PATCH', f"/customers/{customer['id']}", ADMIN, {'currency': 'ZZZ'})[0] == 400)
    g = data(call('GET', f"/invoices/gather?customerId={customer['id']}", ADMIN))
    check('an invoice to the client starts in the client\'s currency',
          (g.get('currency'), g.get('currencySource')) == ('CHF', 'client'), (g.get('currency'), g.get('currencySource')))
    call('PATCH', f"/customers/{customer['id']}", ADMIN, {'currency': ''})
    g = data(call('GET', f"/invoices/gather?customerId={customer['id']}", ADMIN))
    # Since Companies (2026-10-07) the chain is client → company → organization: a client with no
    # company of its own is invoiced by the MAIN company, so the source may read 'company'.
    check('…cleared, it falls to the organization\'s', g.get('currency') == 'EUR' and g.get('currencySource') in ('organization', 'company'), (g.get('currency'), g.get('currencySource')))

    # ── Back to the organization's ───────────────────────────────────────────
    r = call('PATCH', f'/locations/{SPACE}', ADMIN, {'currency': None})
    check('a workspace currency clears back to the organization\'s', data(r).get('currency') is None, data(r))
    g = data(call('GET', f'/invoices/gather?spaceId={SPACE}', ADMIN))
    check('…and its invoices start in EUR again', g.get('currency') == 'EUR' and g.get('currencySource') in ('organization', 'company'), (g.get('currency'), g.get('currencySource')))
    check('issued invoices keep their own currency', data(call('GET', f"/invoices/{made[0]}", ADMIN)).get('currency') == 'USD')
finally:
    for i in made:
        if i: call('DELETE', f'/invoices/{i}', ADMIN)
    if customer and customer.get('id'):
        call('DELETE', f"/customers/{customer['id']}", ADMIN)
    call('PATCH', f'/locations/{SPACE}', ADMIN, {'currency': None})
    call('PATCH', '/organizations/profile', ADMIN, {'currency': 'EUR'})

print(f'\n{fails} failure(s)')
sys.exit(fails)
