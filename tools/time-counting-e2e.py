#!/usr/bin/env python3
"""
LOCAL ONLY — the time-counting model (docs/plans/time-counting-model.md), played as the people who use it,
over real HTTP, with timings and attack attempts.

  python3 tools/time-counting-e2e.py        (gateway on localhost:4000, seed-demo data)

  A. No shift: a 12 h 30 m day at a workspace that flags days past 12 h — counted in full, flagged,
     never cut; clocking in again with no hours left is kept and flagged; "only with a shift" still refuses.
  B. The office sets one day's hours: who may (and who may not), the clock-in that day follows them, a day
     already clocked follows them, nights, refusals, garbage input, the member's notification.
  C. Time outside the shift: listed, decided once (also when two leaders press at the same moment),
     refused to members, bad minutes refused.
  D. Speed: p50 / max per call, with a ceiling for the calls a person waits on.

Everything it changes is put back at the end, also on failure.
"""
import atexit, json, statistics, sys, threading, time, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

BASE = 'http://localhost:4000/api/v1'
PASSWORD = 'password123'
failures = 0
timings: dict = {}
UTC = timezone.utc


def call(method, path, token=None, body=None, label=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {})})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            out = r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            out = e.code, (json.loads(raw) if raw else {})
        except ValueError:
            out = e.code, {}
    if label:
        timings.setdefault(label, []).append((time.perf_counter() - t0) * 1000)
    return out


def data(b):
    return b.get('data', b) if isinstance(b, dict) else b


def check(label, ok, detail=None):
    global failures
    print(('PASS ' if ok else 'FAIL ') + label + ('' if ok or detail is None else f'  → {detail}'))
    failures += 0 if ok else 1


_sessions = []


@atexit.register
def _sign_out():
    for a, r in _sessions:
        call('POST', '/auth/logout', a, {'refreshToken': r})


def login(email):
    for _ in range(10):
        s, b = call('POST', '/auth/login', None, {'email': email, 'password': PASSWORD}, label='sign-in')
        d = data(b) if isinstance(b, dict) else {}
        if d.get('accessToken'):
            _sessions.append((d['accessToken'], d['refreshToken']))
            return d['accessToken'], d['user']
        time.sleep(15)
    sys.exit(f'cannot sign in as {email}')


iso = lambda d: d.astimezone(UTC).strftime('%Y-%m-%dT%H:%M:%S.000Z')
mins = lambda a, b: (datetime.fromisoformat(b.replace('Z', '+00:00')) - datetime.fromisoformat(a.replace('Z', '+00:00'))).total_seconds() / 60


def clock_in(token, place, at=None, label='clock in'):
    body = {'locationId': place['id'], 'lat': place['lat'], 'lng': place['lng'], 'accuracy': 5}
    if at:  # recorded offline: the tap's own moment and position travel with it
        body['evidence'] = {'occurredAt': iso(at), 'fix': {'lat': place['lat'], 'lng': place['lng'], 'accuracy': 5, 'fixAt': iso(at)}}
    return call('POST', '/attendance/clock-in', token, body, label=label)


def clock_out(token, place):
    return call('POST', '/attendance/clock-out', token, {'lat': place['lat'], 'lng': place['lng'], 'accuracy': 5}, label='clock out')


def main():
    owner, _ = login('client@example.com')
    anna, _ = login('manager@example.com')
    noor, noor_u = login('noor@example.com')
    # Mike leads ANOTHER workspace (local demo data): exactly who must not reach this one.
    mike, mike_u = login('mike@example.com')

    if data(call('GET', '/attendance/status', noor)[1]).get('isClockedIn'):
        sys.exit('Noor is clocked in right now — run again later')
    places = data(call('GET', '/attendance/clock-in-locations', noor, label='clock-in places')[1])
    place = next((p for p in places if p.get('lat') is not None and not (p.get('noShift') or {}).get('hasShiftNow')), None)
    if not place:
        sys.exit('no workspace with a site where Noor has no shift now')
    tz = ZoneInfo(place.get('timezone') or 'Europe/Vienna')
    s, loc = call('GET', f"/locations/{place['id']}", owner)
    before = {'noShiftPolicy': data(loc).get('noShiftPolicy') or 'ALLOW', 'noShiftDailyMinutes': data(loc).get('noShiftDailyMinutes') or 480}
    made = {'entries': [], 'requests': []}
    print(f"workspace: {place['name']} ({tz})")

    try:
        # ───────────────────────────────────────────────────────── A
        print('\n— A. no shift: everything counts, a long day is flagged, never cut')
        s, b = call('PATCH', f"/locations/{place['id']}", owner, {'noShiftPolicy': 'LIMIT', 'noShiftDailyMinutes': 720})
        check('the office sets "flag days longer than 12 hours"', s == 200, (s, b))
        start = datetime.now(UTC) - timedelta(hours=12, minutes=30)
        s, b = clock_in(noor, place, at=start, label='clock in (offline)')
        e = data(b) if s in (200, 201) else {}
        made['entries'] += [e['id']] if e.get('id') else []
        check('a clock-in recorded on the phone 12 h 30 m ago is accepted', s in (200, 201), (s, b.get('code'), b.get('message')))
        check('its 12 hours are a marker (the planned end is only the daily limit)', e.get('endIsDailyLimit') is True, e.get('endIsDailyLimit'))
        s, b = clock_out(noor, place)
        out = data(b) if s in (200, 201) else {}
        check('she clocks out now', s in (200, 201), (s, b.get('message')))
        worked = mins(out.get('clockInAt', iso(start)), out.get('clockOutAt', iso(start)))
        check(f"the whole {worked/60:.1f} h counts — not cut at 12 h (counted {out.get('paidMinutes')} min)",
              (out.get('paidMinutes') or 0) >= worked - 1 - (out.get('unpaidBreakMinutes') or 0) and (out.get('paidMinutes') or 0) > 720,
              {k: out.get(k) for k in ('paidMinutes', 'countedEndAt', 'clockOutAt', 'unpaidBreakMinutes')})
        check('counting runs to the clock-out', out.get('countedEndAt') == out.get('clockOutAt'), (out.get('countedEndAt'), out.get('clockOutAt')))
        check('the long day is flagged for the leader', 'PAST_DAILY_LIMIT' in (out.get('flagReasons') or []), out.get('flagReasons'))

        here = next(p for p in data(call('GET', '/attendance/clock-in-locations', noor, label='clock-in places')[1]) if p['id'] == place['id'])
        check('her phone is told today’s hours are used up', (here.get('noShift') or {}).get('workedTodayMinutes', 0) >= 720, here.get('noShift'))
        s, b = clock_in(noor, place)
        again = data(b) if s in (200, 201) else {}
        made['entries'] += [again['id']] if again.get('id') else []
        check('clocking in again with no hours left is KEPT, not refused', s in (200, 201), (s, b.get('code')))
        check('…and flagged past the daily limit', 'PAST_DAILY_LIMIT' in (again.get('flagReasons') or []), again.get('flagReasons'))
        clock_out(noor, place)

        s, b = call('PATCH', f"/locations/{place['id']}", owner, {'noShiftPolicy': 'SHIFT_ONLY'})
        eff = data(call('GET', f"/locations/{place['id']}", owner)[1]).get('noShiftPolicy')
        if s == 200 and eff == 'SHIFT_ONLY':
            s, b = clock_in(noor, place)
            if s in (200, 201):
                made['entries'].append(data(b)['id'])
                clock_out(noor, place)
            check('"only with a shift" still refuses a clock-in without one', s == 400 and b.get('code') == 'NO_SHIFT_TODAY', (s, b.get('code')))
        else:
            print(f'SKIP "only with a shift" (this workspace does not plan shifts: {s} {eff})')
        call('PATCH', f"/locations/{place['id']}", owner, {'noShiftPolicy': 'LIMIT', 'noShiftDailyMinutes': 720})

        # ───────────────────────────────────────────────────────── B
        print('\n— B. the office sets one day’s hours')
        today = datetime.now(tz).strftime('%Y-%m-%d')
        now_l = datetime.now(tz)
        s_t, e_t = (now_l - timedelta(hours=1)).strftime('%H:%M'), (now_l + timedelta(hours=3)).strftime('%H:%M')
        if e_t <= s_t:
            s_t, e_t = '00:01', '23:58'
        body = {'date': today, 'spaceId': place['id'], 'startTime': s_t, 'endTime': e_t, 'reason': 'e2e: delivery'}
        s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", mike, body)
        check('a leader of another workspace cannot set hours here', s in (403, 404), (s, b.get('code')))
        s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", noor, body)
        check('nor can Noor set her own', s in (403, 404), s)
        s, b = call('GET', f"/employees/{noor_u['id']}/day-hours?date={today}&spaceId={place['id']}", mike)
        check('…or read the form here', s in (403, 404), s)
        s, b = call('PUT', f"/employees/{mike_u['id']}/day-hours", noor, {**body, 'spaceId': place['id']})
        check('a member cannot set a colleague’s hours', s in (400, 403, 404), s)
        leader = anna
        s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", anna, body, label='set day hours')
        if s in (403, 404):
            print(f'  (Anna has no rota permission here: {s} — the owner sets it)')
            leader = owner
            s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", owner, body, label='set day hours')
        r = data(b) if s == 200 else {}
        made['requests'] += [r['id']] if r.get('id') else []
        check(f'the leader sets today {s_t}–{e_t} for Noor', s == 200 and r.get('status') == 'APPROVED' and r.get('kind') == 'HOURS', (s, b))
        s, b = call('GET', f"/employees/{noor_u['id']}/day-hours?date={today}&spaceId={place['id']}", leader, label='day hours form')
        v = data(b) if s == 200 else {}
        check('the form reads it back with who set it', (v.get('changed') or {}).get('startTime') == s_t and bool((v.get('changed') or {}).get('setBy')), v)
        s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", leader, {**body, 'reason': 'e2e: again'}, label='set day hours')
        check('setting the day again replaces it — one answer per day', s == 200 and data(b).get('id') == r.get('id'), (s, data(b).get('id'), r.get('id')))

        s, b = clock_in(noor, place)
        e = data(b) if s in (200, 201) else {}
        made['entries'] += [e['id']] if e.get('id') else []
        local = lambda x: datetime.fromisoformat(x.replace('Z', '+00:00')).astimezone(tz).strftime('%H:%M') if x else None
        check('her clock-in today follows the hours the office set',
              s in (200, 201) and local(e.get('expectedClockInAt')) == s_t and local(e.get('expectedClockOutAt')) == e_t and e.get('endIsDailyLimit') is False,
              (s, local(e.get('expectedClockInAt')), local(e.get('expectedClockOutAt')), e.get('endIsDailyLimit')))
        later = (now_l + timedelta(hours=4)).strftime('%H:%M')
        if later > s_t:
            s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", leader, {**body, 'endTime': later}, label='set day hours')
            check('changing it while she works moves today’s running entry — and only it', s == 200 and data(b).get('entriesChanged') == 1, (s, data(b).get('entriesChanged')))
            st = data(call('GET', '/attendance/status', noor)[1])
            cur = (st.get('currentEntry') or st.get('entry') or {})
            check('…her running entry now ends at the new time', local(cur.get('expectedClockOutAt')) == later, local(cur.get('expectedClockOutAt')))
        clock_out(noor, place)

        notes = data(call('GET', '/users/me/notifications?limit=10', noor)[1])
        items = notes.get('items', notes) if isinstance(notes, dict) else notes
        check('Noor is told: “Your hours changed”', any('hour' in json.dumps(n).lower() and 'changed' in json.dumps(n).lower() for n in (items or [])),
              [n.get('title') if isinstance(n, dict) else n for n in (items or [])[:3]])

        d5 = (datetime.now(tz) + timedelta(days=9)).strftime('%Y-%m-%d')
        s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", leader, {**body, 'date': d5, 'startTime': '22:00', 'endTime': '06:00'})
        made['requests'] += [data(b)['id']] if s == 200 else []
        check('a night 22:00–06:00 is taken (it ends the next morning)', s == 200, (s, b.get('code')))
        for st_, en_, why in (('14:00', '09:00', '19 h'), ('08:00', '08:00', 'no time at all'), ('25:00', '26:00', 'not a time')):
            s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", leader, {**body, 'date': d5, 'startTime': st_, 'endTime': en_})
            check(f'{st_}–{en_} is refused ({why})', s == 400 and b.get('code') == 'REQUEST_TIME_INVALID', (s, b.get('code')))
        d7 = (datetime.now(tz) + timedelta(days=12)).strftime('%Y-%m-%d')
        s, b = call('POST', '/employees/time-off/manual', owner, {'technicianId': noor_u['id'], 'startDate': d7, 'endDate': d7, 'reason': 'e2e leave'})
        made['requests'] += [data(b)['id']] if s in (200, 201) else []
        s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", leader, {**body, 'date': d7})
        check('a day of leave is refused — change the leave first', s == 400 and b.get('code') == 'REQUEST_OVERLAPS_LEAVE', (s, b.get('code')))

        print('\n— B2. garbage and other people’s things')
        attacks = [
            ({**body, 'date': f"{today}'; DROP TABLE time_off;--"}, 'SQL after the date'),
            ({**body, 'reason': 'x' * 5000}, 'a 5,000-character reason'),
            ({**body, 'spaceId': 'not-a-workspace'}, 'a workspace that does not exist'),
            ({**body, 'startTime': {'$gt': ''}}, 'an object instead of a time'),
        ]
        for payload, what in attacks:
            s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", leader, payload)
            check(f'{what} is refused cleanly (4xx, never 5xx)', 400 <= s < 500, (s, b.get('code'), b.get('message')))
        s, b = call('PUT', '/employees/00000000-0000-0000-0000-000000000000/day-hours', leader, body)
        check('a person who does not exist is a 404', s == 404, s)
        s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", None, body)
        check('without signing in: 401', s == 401, s)

        # ───────────────────────────────────────────────────────── C
        print('\n— C. time outside the shift')
        day = (datetime.now(tz) - timedelta(days=2)).strftime('%Y-%m-%d')
        s, b = call('POST', '/attendance/entries/manual', owner, {'userId': noor_u['id'], 'locationId': place['id'], 'startDate': day,
                                                                   'endDate': day, 'startTime': '06:30', 'endTime': '17:45', 'reason': 'e2e: long day'})
        hist = data(call('GET', '/attendance/history?limit=40', noor)[1])
        rows = hist.get('entries', hist) if isinstance(hist, dict) else hist
        mine = [x for x in rows or [] if isinstance(x, dict) and datetime.fromisoformat(x['clockInAt'].replace('Z', '+00:00')).astimezone(tz).strftime('%Y-%m-%d') == day]
        eid = mine[0]['id'] if mine else None
        made['entries'] += [eid] if eid else []
        s, b = call('PUT', f"/employees/{noor_u['id']}/day-hours", leader, {'date': day, 'spaceId': place['id'], 'startTime': '08:00', 'endTime': '16:00'})
        made['requests'] += [data(b)['id']] if s == 200 else []
        check('a day 06:30–17:45 against a plan of 08:00–16:00', bool(eid) and s == 200 and data(b).get('entriesChanged') == 1, (eid, s, data(b)))
        s, b = call('GET', '/attendance/outside/pending', leader, label='outside list')
        row = next((x for x in data(b) or [] if x.get('id') == eid), None)
        check('the leader’s list: 1 h 30 m before, 1 h 45 m after', row and row.get('outside') == {'before': 90, 'after': 105, 'total': 195}, row and row.get('outside'))
        s, b = call('GET', '/approvals', leader, label='approvals inbox')
        check('it is in the inbox', any(i['kind'] == 'outside' and i['id'] == eid for i in data(b).get('items', [])), s)
        s, b = call('GET', '/attendance/outside/mine', noor, label='outside mine')
        check('Noor sees it waiting, and for whom', any(x['entryId'] == eid for x in data(b) or []), (s, data(b)))
        for who, tok in (('Noor (about her own day)', noor), ('Mike (leads another workspace)', mike)):
            s, b = call('POST', f'/attendance/entries/{eid}/outside', tok, {'minutes': 195})
            check(f'{who} cannot decide it', s in (403, 404), s)
        for bad in (-5, 99999, 'all'):
            s, b = call('POST', f'/attendance/entries/{eid}/outside', leader, {'minutes': bad})
            check(f'minutes = {bad!r} is refused', s == 400, s)

        # Two leaders press "Count it" at the same moment: exactly one counts.
        results = []
        second = owner if leader is anna else anna
        def press(tok):
            results.append(call('POST', '/approvals/decide', tok, {'kind': 'outside', 'id': eid, 'action': 'approve', 'minutes': 195})[0])
        ts = [threading.Thread(target=press, args=(t,)) for t in (leader, second)]
        [t.start() for t in ts]; [t.join() for t in ts]
        check('two leaders at the same moment: one counts it, the other is told it is decided', sorted(results) in ([200, 403], [200, 409], [200, 404]), results)
        hist = data(call('GET', '/attendance/history?limit=40', noor)[1])
        rows = hist.get('entries', hist) if isinstance(hist, dict) else hist
        x = next((r for r in rows or [] if isinstance(r, dict) and r['id'] == eid), {})
        check(f"all 11 h 15 m count now ({x.get('paidMinutes')} min)", x.get('paidMinutes') == 675, x.get('paidMinutes'))
        s, b = call('GET', '/attendance/outside/pending', leader)
        check('and nobody is asked about it again', not any(r.get('id') == eid for r in data(b) or []), s)
    finally:
        for eid in made['entries']:
            call('DELETE', f'/attendance/entries/{eid}', owner)
        for rid in made['requests']:
            call('DELETE', f'/employees/time-off/{rid}/manage', owner)
        s, _ = call('PATCH', f"/locations/{place['id']}", owner, before)
        check('the workspace, the entries and the requests are put back', s == 200, s)


def report():
    global failures
    print('\n— D. speed (ms)')
    print(f"     {'call':24} {'n':>3} {'p50':>7} {'max':>7}")
    # What a person waits on: a ceiling, on a laptop with every service in watch mode.
    ceiling = {'clock in': 1500, 'clock in (offline)': 1500, 'clock out': 1500, 'clock-in places': 800, 'set day hours': 1500,
               'day hours form': 800, 'outside list': 800, 'outside mine': 800}
    for label, xs in sorted(timings.items()):
        p50, mx = statistics.median(xs), max(xs)
        flag = ''
        if label in ceiling and p50 > ceiling[label]:
            flag = f'  ← over {ceiling[label]} ms'
            failures += 1
        print(f'     {label:24} {len(xs):3} {p50:7.0f} {mx:7.0f}{flag}')


if __name__ == '__main__':
    try:
        main()
    finally:
        report()
        print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)
