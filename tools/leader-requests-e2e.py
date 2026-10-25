#!/usr/bin/env python3
"""
Who approves a leader's own request — played as the people, over real HTTP.

  python3 tools/leader-requests-e2e.py      (gateway on localhost:4000, seed-demo data)

⚠️ LOCAL ONLY. The rule (shared approvals/own-request.ts):
  A. a leader's own extra time goes to the ADMINISTRATORS (Dana runs BILLA demo;
     John and Sarah are asked), and her phone names who it waits for
  B. the ONLY administrator's own request is approved automatically — a
     throwaway one-person organization (e2e-solo-owner@example.test, created
     once and reused) asks for extra time and for a day off
Everything it creates is removed at the end (also on failure); every session
it opens is signed out.
"""
import atexit
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = 'http://localhost:4000/api/v1'
PASSWORD = 'password123'
SOLO_PASSWORD = 'E2eSolo2026'
SOLO = 'e2e-solo-owner@example.test'
failures = 0


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'content-type': 'application/json'}
    if token:
        headers['authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {}
        except ValueError:
            return e.code, {}


def data(body):
    return body.get('data', body) if isinstance(body, dict) else body


def check(label, ok, detail=None):
    global failures
    print(('PASS ' if ok else 'FAIL ') + label + ('' if ok or detail is None else f'  → {detail}'))
    if not ok:
        failures += 1


_sessions = []


@atexit.register
def _sign_out_all():
    for access, refresh in _sessions:
        call('POST', '/auth/logout', access, {'refreshToken': refresh})


def login(email, register=None, password=PASSWORD):
    for _ in range(10):
        s, b = call('POST', '/auth/login', None, {'email': email, 'password': password})
        d = data(b) if isinstance(b, dict) else {}
        if d.get('accessToken'):
            _sessions.append((d['accessToken'], d['refreshToken']))
            return d['accessToken'], d['user']
        if register and s in (400, 401, 404):
            s, b = call('POST', '/auth/register', None, register)
            register = None
            continue
        time.sleep(15)
    sys.exit(f'cannot sign in as {email}')


def clock_in_somewhere(token, name=None):
    places = data(call('GET', '/attendance/clock-in-locations', token)[1]) or []
    for p in places:
        if name and p['name'] != name:
            continue
        # A workspace with no site is geofence-exempt; the fix is still required.
        fix = {'locationId': p['id'], 'accuracy': 5, 'lat': p['lat'] if p.get('lat') is not None else 47.98, 'lng': p['lng'] if p.get('lng') is not None else 13.82}
        s, b = call('POST', '/attendance/clock-in', token, fix)
        if s in (200, 201):
            return data(b), p
    return None, places


def hours_now():
    """Planned hours around now, local: one hour back to 45 minutes ahead (an end past midnight is next morning)."""
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo
    now = _dt.now(ZoneInfo('Europe/Vienna'))
    return now.strftime('%Y-%m-%d'), (now - timedelta(hours=1)).strftime('%H:%M'), (now + timedelta(minutes=45)).strftime('%H:%M')


def plan_day(setter, user_id, space_id):
    """More time extends a PLANNED end (clock review B1): the office sets the person's hours today. Returns the
    request id to remove afterwards."""
    day, start, end = hours_now()
    s, b = call('PUT', f'/employees/{user_id}/day-hours', setter,
                {'date': day, 'spaceId': space_id, 'startTime': start, 'endTime': end, 'reason': 'e2e: planned'})
    check(f'the office plans {start}–{end} today', s == 200, (s, b))
    return (data(b) or {}).get('id') if s == 200 else None


def main():
    print('— A. a leader asks: the administrators are asked')
    karim, karim_user = login('dana@example.com')
    status = data(call('GET', '/attendance/status', karim)[1])
    if status.get('isClockedIn'):
        print('SKIP A (Dana is clocked in right now)')
    else:
        john0, _ = login('client@example.com')
        billa = next((p for p in data(call('GET', '/attendance/clock-in-locations', karim)[1]) or [] if p['name'] == 'BILLA demo'), None)
        planned = plan_day(john0, karim_user['id'], billa['id']) if billa else None
        entry, where = clock_in_somewhere(karim, 'BILLA demo')
        check('Dana (runs BILLA demo) clocks in there', bool(entry), where)
        if entry:
            try:
                s, b = call('POST', f"/attendance/entries/{entry['id']}/request-extra-time", karim, {})
                check('she asks for extra time', s in (200, 201) and data(b).get('status') == 'OVERTIME_PENDING', (s, b))
                ot = data(call('GET', '/overtime/active', karim)[1]) or {}
                names = (ot.get('askedOf') or {}).get('names') or []
                more = (ot.get('askedOf') or {}).get('more', 0)
                check('it waits for the administrators, by name — not for nobody', set(names) | ({'…'} if more else set()) >= {'John'} and 'Dana' not in names, ot.get('askedOf'))
                john, _ = login('client@example.com')
                inbox = data(call('GET', '/approvals', john)[1]) or {}
                mine = [i for i in inbox.get('items', []) if i.get('kind') == 'extraTime' and entry['id'] in json.dumps(i)]
                check("it is in John's approvals", len(mine) == 1, [i.get('kind') for i in inbox.get('items', [])][:10])
                s, b = call('POST', '/approvals/decide', john, {'kind': 'extraTime', 'id': entry['id'], 'action': 'approve', 'minutes': 30})
                check('John approves it with one tap', s == 200, (s, b))
            finally:
                call('POST', '/attendance/clock-out', karim, {'lat': 47.98, 'lng': 13.82, 'accuracy': 5})
                owner, _ = login('client@example.com')
                call('DELETE', f"/attendance/entries/{entry['id']}", owner)
                if planned:
                    call('DELETE', f'/employees/time-off/{planned}/manage', owner)

    print('\n— B. the only administrator asks: approved automatically')
    solo, solo_user = login(SOLO, password=SOLO_PASSWORD, register={'email': SOLO, 'password': SOLO_PASSWORD, 'firstName': 'Solo', 'lastName': 'Owner', 'companyName': 'E2E Solo Owner', 'firstSpaceName': 'Solo Site'})
    check('a one-person organization: its owner is the only administrator', solo_user.get('role') == 'ADMIN', solo_user.get('role'))
    status = data(call('GET', '/attendance/status', solo)[1])
    entry = None
    leave = None
    undo = []
    try:
        if status.get('isClockedIn'):
            entry = status.get('currentEntry')
        else:
            # The owner works at their own site: put them on it (adding grants nothing).
            spaces = data(call('GET', '/locations', solo)[1]) or []
            spaces = spaces.get('items', spaces) if isinstance(spaces, dict) else spaces
            if not spaces:
                st, b = call('POST', '/locations', solo, {'name': 'Solo Site'})
                spaces = [data(b)] if st in (200, 201) else []
                check('the owner adds their site', bool(spaces), (st, b))
            for sp in spaces:
                call('POST', f"/locations/{sp['id']}/members", solo, {'userId': solo_user['id']})
            # An administrator cannot set their own day; their own throwaway site works in shifts for the test.
            day, start, end = hours_now()
            dow = (date.fromisoformat(day).weekday() + 1) % 7
            for sp in spaces:
                call('PATCH', f"/locations/{sp['id']}", solo, {'workModel': 'SHIFT'})
                undo.append(('PATCH', f"/locations/{sp['id']}", {'workModel': sp.get('workModel') or 'NONE'}))
            s, b = call('POST', f"/employees/{solo_user['id']}/schedule", solo,
                        {'schedule': [{'dayOfWeek': dow, 'startTime': start, 'endTime': end if end > start else '23:59'}]})
            check('the owner plans their own hours today', s in (200, 201), (s, b))
            undo.append(('POST', f"/employees/{solo_user['id']}/schedule", {'schedule': []}))
            entry, where = clock_in_somewhere(solo)
        check('the owner clocks in', bool(entry), None if entry else where)
        if entry:
            s, b = call('POST', f"/attendance/entries/{entry['id']}/request-extra-time", solo, {})
            check('asks for extra time → approved at once', s in (200, 201) and data(b).get('automatic') is True, (s, b))
            ot = data(call('GET', '/overtime/active', solo)[1]) or {}
            check('recorded as approved automatically, by the owner', ot.get('status') == 'APPROVED' and ot.get('approvalMethod') == 'AUTOMATIC' and ot.get('approvedById') == solo_user['id'], {k: ot.get(k) for k in ('status', 'approvalMethod', 'approvedById')})
        # Back to how the site was before the leave check — a one-day rota would make every other day a rest day.
        for m_, p_, b_ in undo:
            call(m_, p_, solo, b_)
        undo = []
        d = date.today() + timedelta(days=30)
        while d.weekday() >= 5:
            d += timedelta(days=1)
        day = d.isoformat()
        s, b = call('POST', f"/employees/{solo_user['id']}/time-off", solo, {'kind': 'LEAVE', 'type': 'VACATION', 'startDate': day, 'endDate': day, 'reason': 'e2e: own leave'})
        leave = data(b) if s in (200, 201) else None
        check('asks for a day off → approved at once, recorded as automatic', bool(leave) and leave.get('status') == 'APPROVED' and leave.get('autoApproved') is True, (s, b))
        inbox = data(call('GET', '/approvals', solo)[1]) or {}
        check('nothing waits in anybody\'s approvals', len(inbox.get('items', [])) == 0, len(inbox.get('items', [])))
    finally:
        if entry:
            call('POST', '/attendance/clock-out', solo, {'lat': 47.98, 'lng': 13.82, 'accuracy': 5})
            call('DELETE', f"/attendance/entries/{entry['id']}", solo)
        if leave:
            call('DELETE', f"/employees/time-off/{leave['id']}/manage", solo)
        for m_, p_, b_ in undo:
            call(m_, p_, solo, b_)


if __name__ == '__main__':
    try:
        main()
    finally:
        print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)
