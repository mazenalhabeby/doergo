#!/usr/bin/env python3
"""
LOCAL ONLY — the clock review (docs/plans/clock-review-2026-10.md) over real HTTP, as the demo people.

  C7  who decides my time            A7  an administrator's own clock switch
  C1  refusals that say what to do   A10 time outside the shift = the hours approvers' decision
  C2  a pinned site needs a position B1  more time needs a shift · B9 an open entry is not decided
  D1  "works here as" per worker — attacks, then a far-away clock-in honoured only after the office sets it

Leaves the data as it found it: Mike's own rules are put back, the entry it makes is deleted, John's clock is on.

    python3 tools/clock-review-e2e.py
"""
import json, subprocess, sys, time, urllib.request, urllib.error

API = 'http://localhost:4000/api/v1'
FAR = {'lat': 48.2082, 'lng': 16.3738, 'accuracy': 10}  # Vienna — hundreds of km from every demo site
failures = 0


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read() or b'null'
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw.decode(errors='replace')


def data(b):
    return (b or {}).get('data', b) if isinstance(b, dict) else b


def code(b):
    if not isinstance(b, dict):
        return None
    for k in ('code', 'errorCode'):
        if b.get(k):
            return b[k]
    for k in ('error', 'message', 'details'):
        if isinstance(b.get(k), dict):
            c = code(b[k])
            if c:
                return c
    return None


def check(name, ok, detail=None):
    global failures
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  → {detail}'))
    failures += 0 if ok else 1


def login(email, optional=False):
    for _ in range(4):
        s, b = call('POST', '/auth/login', body={'email': email, 'password': 'password123'})
        if s == 429:
            time.sleep(20)
            continue
        if s >= 400:
            if optional:
                return None, None
            sys.exit(f'cannot sign in as {email}: {s} {b}')
        d = data(b)
        return d['accessToken'], d['user']['id']
    sys.exit(f'cannot sign in as {email}')


def status_of(token):
    return data(call('GET', '/attendance/status', token)[1]) or {}


def open_entry(token):
    st = status_of(token)
    e = st.get('currentEntry') or st.get('activeEntry') or st.get('entry')
    return e if isinstance(e, dict) and e.get('status') == 'CLOCKED_IN' else None


def main():
    owner, owner_id = login('client@example.com')
    anna, _ = login('manager@example.com')
    mike, mike_id = login('mike@example.com')
    klaus, _ = login('klaus@example.com', optional=True)

    # ── C7 ──────────────────────────────────────────────────────────────
    s, b = call('GET', '/attendance/approvers/mine', mike)
    check('C7 Mike reads who decides his own time', s == 200 and isinstance(data(b), (list, dict)), (s, b))
    if klaus:
        s, _ = call('GET', '/attendance/approvers/mine', klaus)
        check('C7 an external member holds no clock — refused', s in (403, 404), s)

    # Mike must start off the clock.
    if open_entry(mike):
        sys.exit('Mike is clocked in — clock him out first (this script never closes a real shift)')

    # ── C1 ──────────────────────────────────────────────────────────────
    s, b = call('POST', '/attendance/clock-in', mike, {**FAR})
    check('C1 a clock-in naming no place says LOCATION_REQUIRED', s == 400 and code(b) == 'LOCATION_REQUIRED', (s, b))
    s, b = call('POST', '/attendance/clock-out', mike, {**FAR})
    check('C1 a clock-out off the clock says NOT_ON_THE_CLOCK', s >= 400 and code(b) == 'NOT_ON_THE_CLOCK', (s, b))

    places = data(call('GET', '/attendance/clock-in-locations', mike)[1]) or []
    places = places.get('locations', places) if isinstance(places, dict) else places
    pinned = [p for p in places if p.get('lat') is not None and p.get('lng') is not None]
    if not pinned:
        sys.exit('Mike has no workspace with coordinates on this demo data')
    site = pinned[0]
    every = data(call('GET', '/locations?limit=100', owner)[1]) or []
    every = every.get('items', every) if isinstance(every, dict) else every
    other = next((l for l in every if l.get('id') not in {p['id'] for p in places} and not l.get('isRemote')), None)
    if other:
        s, b = call('POST', '/attendance/clock-in', mike, {'locationId': other['id'], **FAR})
        check('C1 a workspace he is not assigned to says NOT_ASSIGNED_HERE', s >= 400 and code(b) == 'NOT_ASSIGNED_HERE', (s, b))

    # ── C2 ──────────────────────────────────────────────────────────────
    if (site.get('geofencePolicy') or 'STRICT') != 'NONE':
        s, b = call('POST', '/attendance/clock-in', mike, {'locationId': site['id']})
        check('C2 a pinned site with no position says FIX_MISSING', s >= 400 and code(b) == 'FIX_MISSING', (s, b))

    # ── D1 attacks ──────────────────────────────────────────────────────
    rows = data(call('GET', f'/employees/{mike_id}/assignments', owner)[1]) or []
    assignment = next((a for a in rows if (a.get('locationId') or a.get('spaceId')) == site['id']), None)
    check('D1 the office reads Mike\'s assignment there, own rules included', bool(assignment) and 'workAs' in assignment,
          rows[:1])
    if not assignment:
        return
    path = f"/locations/{site['id']}/members/{assignment['id']}"
    before = {'workAs': assignment.get('workAs'), 'workDailyMinutes': assignment.get('workDailyMinutes')}
    s, _ = call('PATCH', path, mike, {'workAs': 'IN_THE_FIELD'})
    check('D1 a worker cannot set his own rules', s == 403, s)
    s, b = call('PATCH', path, owner, {'workAs': 'NIGHT_OWL'})
    check('D1 an unknown way of working is refused', s == 400, (s, b))
    s, b = call('PATCH', path, owner, {'workDailyMinutes': 10})
    check('D1 own hours under 30 minutes are refused', s == 400, (s, b))
    s, b = call('PATCH', path, owner, {'workDailyMinutes': 'x'})
    check('D1 own hours must be a number', s == 400, (s, b))

    made = None
    try:
        # Far away, on the workspace's own rules.
        ws_rules = next((p for p in places if p['id'] == site['id']), site)
        if (ws_rules.get('geofencePolicy') or 'STRICT') == 'STRICT':
            s, b = call('POST', '/attendance/clock-in', mike, {'locationId': site['id'], **FAR})
            check('D1 before: far from a STRICT site is refused', s >= 400, (s, b))
            if s < 400:
                made = (data(b) or {}).get('id')
                return

        s, b = call('PATCH', path, owner, {'workAs': 'IN_THE_FIELD', 'workDailyMinutes': 360})
        check('D1 the office sets Mike to work there "in the field", 6 h a day', s == 200, (s, b))

        t0 = time.time()
        listed = data(call('GET', '/attendance/clock-in-locations', mike)[1]) or []
        listed = listed.get('locations', listed) if isinstance(listed, dict) else listed
        mine = next((p for p in listed if p['id'] == site['id']), {})
        check('D1 his clock-in list now reads that workspace his way (no ring, 6 h, own rules)',
              mine.get('geofencePolicy') == 'NONE' and mine.get('noShiftDailyMinutes') == 360 and mine.get('ownRules') is True,
              {k: mine.get(k) for k in ('geofencePolicy', 'noShiftPolicy', 'noShiftDailyMinutes', 'ownRules')})
        st = status_of(mike)
        sp = next((a for a in st.get('assignedLocations') or [] if a.get('id') == site['id']), {})
        check('D1 the status read (the phone\'s offline check) says the same',
              sp.get('geofencePolicy') == 'NONE' and sp.get('noShiftDailyMinutes') == 360,
              {k: sp.get(k) for k in ('geofencePolicy', 'noShiftDailyMinutes')})
        check('D1 both reads answer fast', time.time() - t0 < 1.5, round(time.time() - t0, 2))

        s, b = call('POST', '/attendance/clock-in', mike, {'locationId': site['id'], **FAR})
        made = (data(b) or {}).get('id') if s < 400 else None
        check('D1 after: the same far-away clock-in is taken', s in (200, 201) and bool(made), (s, b))
        if made:
            # ── B1, B9 while the entry is open ──────────────────────────
            s, b = call('POST', f'/attendance/entries/{made}/request-extra-time', mike, {})
            check('B1 asking for more time with no shift says EXTRA_TIME_NO_SHIFT',
                  s >= 400 and code(b) == 'EXTRA_TIME_NO_SHIFT', (s, b))
            s, b = call('POST', f'/attendance/approvals/{made}/approve', owner, {})
            # An open entry is refused — as still open, or (where the workspace approves on its own) as already decided.
            check('B9 an open entry cannot be approved', s >= 400 and code(b) in ('ENTRY_STILL_OPEN', 'ENTRY_ALREADY_DECIDED'),
                  (s, b))
            s, b = call('POST', '/attendance/heartbeat', mike, FAR)
            hb = data(b) or {}
            check('D1 his heartbeat from far away is in his (switched-off) ring — no excursion',
                  s in (200, 201) and hb.get('inRing') is True and not hb.get('activeExcursion'), (s, hb))
            s, b = call('POST', '/attendance/clock-out', mike, {**FAR, 'entryId': made})
            check('D1 he clocks out from where the work was', s in (200, 201), (s, b))
            hist = data(call('GET', '/attendance/history?limit=10', mike)[1]) or {}
            rows_h = hist.get('entries', hist) if isinstance(hist, dict) else hist
            done = next((r for r in rows_h or [] if isinstance(r, dict) and r.get('id') == made), {})
            check('D1 and the clock-out is not flagged as outside the site',
                  'OUTSIDE_GEOFENCE_OUT' not in (done.get('flagReasons') or []), done.get('flagReasons'))
    finally:
        if made:
            open_now = open_entry(mike)
            if open_now and open_now.get('id') == made:
                call('POST', '/attendance/clock-out', mike, {**FAR, 'entryId': made})
            s, b = call('DELETE', f'/attendance/entries/{made}', owner)
            check('cleanup: the test entry is deleted', s == 200, (s, b))
        s, _ = call('PATCH', path, owner, before)
        check('cleanup: Mike\'s rules there are put back', s == 200, s)

    # ── A10 ─────────────────────────────────────────────────────────────
    # Decided by who approves HOURS — canApproveAttendance, or what carries it (ORG_FLAG_BRIDGES), anywhere.
    deciders = ('canApproveAttendance', 'canReconcileAttendance', 'canManageUsers')

    def may_decide(token):
        acc = (data(call('GET', '/auth/me', token)[1]) or {}).get('access') or {}
        grants = [acc.get('org') or {}, *(acc.get('perSpace') or {}).values()]
        return any(g.get(k) for g in grants for k in deciders)

    tried = 0
    for email in ('mike@example.com', 'manager@example.com', 'sarah@example.com', 'karim@example.com', 'lisa@example.com',
                  'hassan@example.com', 'dana@example.com', 'david@example.com', 'noor@example.com'):
        tok, _ = login(email)
        expect = 200 if may_decide(tok) else 403
        s, _ = call('GET', '/attendance/outside/pending', tok)
        check(f'A10 {email} reads the outside-the-shift list only if they approve hours ({expect})', s == expect, s)
        if expect == 403:
            tried += 1
            s, _ = call('POST', '/attendance/entries/00000000-0000-0000-0000-000000000000/outside', tok, {'minutes': 0})
            check(f'A10 and cannot decide one ({email})', s == 403, s)
    if not tried:
        # The local demo data gives everyone a legacy canManageUsers flag; take Noor's away for one check.
        flip = lambda v: subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-qU', 'hbcfield', 'hbcfield', '-c',
                                         f"update users set \"canManageUsers\"={v} where email='noor@example.com'"],
                                        check=True, capture_output=True)
        was = subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-tAU', 'hbcfield', 'hbcfield', '-c',
                              "select \"canManageUsers\" from users where email='noor@example.com'"],
                             capture_output=True, text=True).stdout.strip() == 't'
        flip('false')
        try:
            tok, _ = login('noor@example.com')
            if not may_decide(tok):
                tried += 1
                s, _ = call('GET', '/attendance/outside/pending', tok)
                check('A10 Noor without the right cannot read the list', s == 403, s)
                s, _ = call('POST', '/attendance/entries/00000000-0000-0000-0000-000000000000/outside', tok, {'minutes': 0})
                check('A10 and cannot decide one', s == 403, s)
        finally:
            flip('true' if was else 'false')
    check('A10 at least one person without the right was tried', tried > 0, tried)
    s, _ = call('GET', '/attendance/outside/pending', owner)
    check('A10 the owner reads it', s == 200, s)

    # ── A7 ──────────────────────────────────────────────────────────────
    s, b = call('PATCH', '/users/me', mike, {'usesClock': False})
    check('A7 a worker cannot switch his own clock off — CLOCK_SWITCH_ADMIN_ONLY',
          s == 400 and code(b) == 'CLOCK_SWITCH_ADMIN_ONLY', (s, b))
    if open_entry(owner):
        s, b = call('PATCH', '/users/me', owner, {'usesClock': False})
        check('A7 not while clocked in — CLOCK_SWITCH_WHILE_CLOCKED_IN', s == 409, (s, b))
    else:
        try:
            s, b = call('PATCH', '/users/me', owner, {'usesClock': False})
            check('A7 John switches his own clock off', s == 200, (s, b))
            owner2, _ = login('client@example.com')
            me = data(call('GET', '/auth/me', owner2)[1]) or {}
            check('A7 his session says so', me.get('clockOff') is True, {k: me.get(k) for k in ('clockOff', 'role')})
            s, b = call('POST', '/attendance/clock-in', owner2, {'isRemote': True, **FAR})
            check('A7 and the clock refuses him', s in (402, 403), (s, b))
        finally:
            s, _ = call('PATCH', '/users/me', owner, {'usesClock': True})
            check('cleanup: John\'s clock is back on', s == 200, s)

    # ── speed ───────────────────────────────────────────────────────────
    t = []
    for _ in range(10):
        t0 = time.time()
        call('GET', '/attendance/status', mike)
        t.append(time.time() - t0)
    t.sort()
    check('the status read (polled all day) stays fast — median < 250 ms', t[5] < 0.25, [round(x * 1000) for x in t])

    print(f"\n{'ALL PASS' if not failures else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
