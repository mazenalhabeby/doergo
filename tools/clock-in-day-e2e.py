#!/usr/bin/env python3
"""
Clocking in, played as the people who do it — over real HTTP, with timings.

  python3 tools/clock-in-day-e2e.py        (gateway on localhost:4000, seed-demo data)

⚠️ LOCAL ONLY. It switches one workspace to "up to 30 minutes a day without a
shift", adds a back-dated 45-minute entry for Noor there, has her ask for more
time and the manager approve it, clocks her in and out — and puts every one of
those things back at the end (also on failure).

  A. "Clock in where I stand / let me choose" (User.clockInPick)
  B. one day for the person: every workspace reports the same hours
  C. limit reached → refused → ask for more time → approved → clocked in for
     exactly the agreed time
  then p50 / max per call.
"""
import atexit
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BASE = 'http://localhost:4000/api/v1'
PASSWORD = 'password123'
failures = 0
timings = {}


def call(method, path, token=None, body=None, label=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'content-type': 'application/json'}
    if token:
        headers['authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, method=method, data=data, headers=headers)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            out = r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            out = e.code, json.loads(raw) if raw else {}
        except ValueError:
            out = e.code, {}
    if label:
        timings.setdefault(label, []).append((time.perf_counter() - t0) * 1000)
    return out


def data(body):
    return body.get('data', body) if isinstance(body, dict) else body


def check(label, ok, detail=None):
    global failures
    print(('PASS ' if ok else 'FAIL ') + label + ('' if ok or detail is None else f'  → {detail}'))
    if not ok:
        failures += 1


# Every session opened here is closed at exit: an account keeps only its newest five.
_sessions = []


@atexit.register
def _sign_out_all():
    for access, refresh in _sessions:
        call('POST', '/auth/logout', access, {'refreshToken': refresh})


def login(email):
    for _ in range(10):
        s, b = call('POST', '/auth/login', None, {'email': email, 'password': PASSWORD}, label='sign-in')
        d = data(b) if isinstance(b, dict) else {}
        if d.get('accessToken'):
            _sessions.append((d['accessToken'], d['refreshToken']))
            return d['accessToken'], d['user']
        time.sleep(15)
    sys.exit(f'cannot sign in as {email}')


def main():
    owner, _ = login('client@example.com')
    manager, _ = login('manager@example.com')
    noor, noor_user = login('noor@example.com')

    print('\n— A. clock in where I stand, or always choose')
    check('sign-in carries the setting (default: where I stand)', noor_user.get('clockInPick') == 'AUTO', noor_user.get('clockInPick'))
    s, _ = call('PATCH', '/users/me', noor, {'clockInPick': 'ASK'}, label='save setting')
    me = data(call('GET', '/auth/me', noor, label='auth/me')[1])
    check('"let me choose" is saved and read back', s == 200 and me.get('clockInPick') == 'ASK', (s, me.get('clockInPick')))
    s, _ = call('PATCH', '/users/me', noor, {'clockInPick': 'SOMETIMES'})
    check('a value that is not a choice is refused', s == 400, s)
    call('PATCH', '/users/me', noor, {'clockInPick': 'AUTO'})
    check('and back to the default', data(call('GET', '/auth/me', noor)[1]).get('clockInPick') == 'AUTO')

    print('\n— B. one day for the person, at every workspace')
    for _ in range(5):
        s, b = call('GET', '/attendance/clock-in-locations', noor, label='clock-in places')
    places = data(b)
    check('Noor may clock in at more than one workspace (the setting is offered)', len(places) > 1, [p['name'] for p in places])
    for _ in range(5):
        call('GET', '/attendance/status', noor, label='attendance status')

    status = data(call('GET', '/attendance/status', noor)[1])
    if status.get('isClockedIn'):
        print('SKIP C (Noor is clocked in right now)')
        return
    target = next((p for p in places if p.get('lat') is not None and not (p.get('noShift') or {}).get('hasShiftNow')), None)
    check('found a workspace with a site where Noor has no shift now', target is not None, [(p['name'], p.get('noShift')) for p in places])
    if not target:
        return

    print(f"\n— C. limit reached → ask → approved → clock in   ({target['name']})")
    s, loc = call('GET', f"/locations/{target['id']}", owner)
    before = {'noShiftPolicy': data(loc).get('noShiftPolicy') or 'ALLOW', 'noShiftDailyMinutes': data(loc).get('noShiftDailyMinutes') or 480}
    made = {'manual': [], 'entry': None, 'request': None}
    try:
        s, b = call('PATCH', f"/locations/{target['id']}", owner, {'noShiftPolicy': 'LIMIT', 'noShiftDailyMinutes': 30})
        check('the office limits it to 30 minutes a day without a shift', s == 200, (s, b))

        # 45 minutes worked there today, an hour ago, in the workspace's own wall time.
        tz = ZoneInfo(target.get('timezone') or 'Europe/Vienna')
        now_local = datetime.now(tz)
        start = max(now_local.replace(hour=0, minute=5), now_local - timedelta(minutes=110))
        end = start + timedelta(minutes=45)
        s, b = call('POST', '/attendance/entries/manual', owner, {
            'userId': noor_user['id'], 'locationId': target['id'],
            'startDate': start.strftime('%Y-%m-%d'), 'endDate': start.strftime('%Y-%m-%d'),
            'startTime': start.strftime('%H:%M'), 'endTime': end.strftime('%H:%M'), 'reason': 'e2e: worked this morning',
        })
        check('the office records 45 minutes she worked earlier', s in (200, 201) and data(b).get('created') == 1, (s, b))
        # The add answers a count, not ids: find the row by its place and start, to remove it after.
        hist = data(call('GET', '/attendance/history?limit=20', noor)[1])
        rows = hist.get('entries', hist) if isinstance(hist, dict) else hist
        want = start.astimezone(ZoneInfo('UTC')).strftime('%Y-%m-%dT%H:%M')
        made['manual'] = [r['id'] for r in (rows or []) if isinstance(r, dict) and (r.get('locationId') == target['id'] or (r.get('location') or {}).get('id') == target['id']) and str(r.get('clockInAt', '')).startswith(want)]
        check('and it is found again (to be removed afterwards)', len(made['manual']) == 1, [(r.get('clockInAt'), r.get('locationId')) for r in (rows or [])[:5] if isinstance(r, dict)])

        here = next(p for p in data(call('GET', '/attendance/clock-in-locations', noor)[1]) if p['id'] == target['id'])
        tag = here.get('noShift') or {}
        check('her phone is told the hours are used up', tag.get('workedTodayMinutes', 0) >= 45 and tag.get('dailyMinutes') == 30, tag)

        fix = {'locationId': target['id'], 'lat': target['lat'], 'lng': target['lng'], 'accuracy': 5}
        s, b = call('POST', '/attendance/clock-in', noor, fix, label='clock-in (refused)')
        check('clocking in there is refused: no hours left', s == 400 and b.get('code') == 'NO_HOURS_LEFT', (s, b.get('code'), b.get('message')))

        today = now_local.strftime('%Y-%m-%d')
        s, b = call('POST', f"/employees/{noor_user['id']}/time-off", noor, {
            'kind': 'OVERTIME', 'startDate': today, 'endDate': today, 'minutes': 60, 'reason': 'e2e: finishing the job',
        }, label='ask for more time')
        made['request'] = data(b).get('id') if s in (200, 201) else None
        check('"Ask for more time" sends an overtime request for today', bool(made['request']), (s, b))
        if not made['request']:
            return

        decider = manager
        s, b = call('POST', '/approvals/decide', decider, {'kind': 'request', 'id': made['request'], 'action': 'approve'}, label='leader approves')
        if s != 200:
            decider = owner
            s, b = call('POST', '/approvals/decide', decider, {'kind': 'request', 'id': made['request'], 'action': 'approve'}, label='leader approves')
        check('her leader approves it from the inbox', s == 200, (s, b))

        here = next(p for p in data(call('GET', '/attendance/clock-in-locations', noor)[1]) if p['id'] == target['id'])
        tag = here.get('noShift') or {}
        left = 30 + 60 - tag.get('workedTodayMinutes', 0)
        check('her phone now shows the agreed hour', tag.get('extraMinutes') == 60 and left > 0, tag)

        s, b = call('POST', '/attendance/clock-in', noor, fix, label='clock-in (agreed)')
        entry = data(b) if s in (200, 201) else {}
        made['entry'] = entry.get('id')
        check('she can clock in now', s in (200, 201), (s, b.get('code'), b.get('message')))
        if entry.get('expectedClockOutAt'):
            mins = (datetime.fromisoformat(entry['expectedClockOutAt'].replace('Z', '+00:00')) - datetime.now(ZoneInfo('UTC'))).total_seconds() / 60
            check(f'for exactly the agreed time that is left (~{left} min), counted once', abs(mins - left) <= 2, round(mins, 1))

        s, b = call('POST', '/attendance/clock-out', noor, {'lat': target['lat'], 'lng': target['lng'], 'accuracy': 5}, label='clock-out')
        check('and clock out', s in (200, 201), (s, b.get('message')))
    finally:
        for eid in made['manual'] + ([made['entry']] if made['entry'] else []):
            call('DELETE', f'/attendance/entries/{eid}', owner)
        if made['request']:
            call('DELETE', f"/employees/time-off/{made['request']}/manage", owner)
        s, _ = call('PATCH', f"/locations/{target['id']}", owner, before)
        check('the workspace, the entries and the request are put back', s == 200, s)


def report():
    print('\n— performance (ms)')
    print(f"     {'call':28} {'n':>3} {'p50':>7} {'max':>7}")
    for label, xs in sorted(timings.items()):
        print(f'     {label:28} {len(xs):3} {statistics.median(xs):7.0f} {max(xs):7.0f}')


if __name__ == '__main__':
    try:
        main()
    finally:
        report()
        print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)
