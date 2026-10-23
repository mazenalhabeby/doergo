#!/usr/bin/env python3
"""
LOCAL ONLY — time worked outside the planned shift, one decision (docs/plans/time-counting-model.md, phases 2–3).

Builds a day for Mike on the demo data: a manual entry 07:00–17:30 yesterday, then the office sets his plan for
that day to 08:00–16:00 (PUT /employees/:id/day-hours, which re-shapes the entry). Then: the leader's list, the
inbox item, Mike's own "waiting for" line, counting 2 h of the 2 h 30 m, decided once. Removes what it made.

    python3 tools/outside-shift-e2e.py
"""
import json, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

API = 'http://localhost:4000/api/v1'
failures = 0


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def data(b):
    return (b or {}).get('data', b) if isinstance(b, dict) else b


def check(name, ok, detail=None):
    global failures
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  → {detail}'))
    failures += 0 if ok else 1


def login(email):
    for _ in range(4):
        s, b = call('POST', '/auth/login', body={'email': email, 'password': 'password123'})
        if s == 429:
            time.sleep(20)
            continue
        d = data(b)
        return d['accessToken'], d['user']['id']
    sys.exit(f'cannot sign in as {email}')


def main():
    owner, _ = login('client@example.com')
    mike, mike_id = login('mike@example.com')
    floor = data(call('GET', '/employees/floor-now', owner)[1]) or []
    space = next((sp for sp in floor if any(p['id'] == mike_id for p in sp.get('people', []))), None)
    if not space:
        sys.exit('Mike works in no workspace on this demo data')
    tz = ZoneInfo(space.get('timezone') or 'Europe/Vienna')
    day = (datetime.now(tz) - timedelta(days=1)).strftime('%Y-%m-%d')
    made = {'entry': None, 'hours': None}
    try:
        s, b = call('POST', '/attendance/entries/manual', owner, {
            'userId': mike_id, 'locationId': space['spaceId'], 'startDate': day, 'endDate': day,
            'startTime': '07:00', 'endTime': '17:30', 'reason': 'e2e: a long day',
        })
        check('the office records 07:00–17:30 for Mike yesterday', s in (200, 201) and data(b).get('created') == 1, (s, b))
        hist = data(call('GET', '/attendance/history?limit=30', mike)[1])
        rows = hist.get('entries', hist) if isinstance(hist, dict) else hist
        mine = [r for r in rows or [] if isinstance(r, dict) and str(r.get('notes') or r.get('reason') or '').find('e2e: a long day') >= 0]
        mine = mine or [r for r in rows or [] if isinstance(r, dict) and datetime.fromisoformat(r['clockInAt'].replace('Z', '+00:00')).astimezone(tz).strftime('%Y-%m-%d') == day]
        made['entry'] = mine[0]['id'] if mine else None
        check('and it is found', bool(made['entry']), [(r.get('clockInAt'), r.get('notes')) for r in (rows or [])[:4]])
        if not made['entry']:
            return

        s, b = call('PUT', f'/employees/{mike_id}/day-hours', owner,
                    {'date': day, 'spaceId': space['spaceId'], 'startTime': '08:00', 'endTime': '16:00', 'reason': 'e2e: the plan'})
        made['hours'] = (data(b) or {}).get('id')
        check('the office sets his plan for that day to 08:00–16:00, and the entry follows',
              s == 200 and (data(b) or {}).get('entriesChanged') == 1, (s, data(b)))

        s, b = call('GET', '/attendance/outside/pending', owner)
        row = next((r for r in data(b) or [] if r['id'] == made['entry']), None)
        check('the leader’s list has 1 h before and 1 h 30 m after', row and row.get('outside') == {'before': 60, 'after': 90, 'total': 150},
              (s, row and row.get('outside')))

        s, b = call('GET', '/approvals', owner)
        item = next((i for i in (data(b) or {}).get('items', []) if i['kind'] == 'outside' and i['id'] == made['entry']), None)
        check('the inbox shows it as “time outside the shift”, the minutes filled in', item and item['data'].get('requestedMinutes') == 150,
              item and item.get('data'))

        s, b = call('GET', '/attendance/outside/mine', mike)
        w = next((x for x in data(b) or [] if x['entryId'] == made['entry']), None)
        check('Mike sees 2 h 30 m waiting, and for whom', w and w['total'] == 150 and 'askedOf' in w, (s, w))

        s, b = call('GET', '/attendance/outside/pending', mike)
        check('Mike cannot read the leaders’ list', s == 403 or not any(r['id'] == made['entry'] for r in data(b) or []), s)

        s, b = call('POST', '/approvals/decide', owner, {'kind': 'outside', 'id': made['entry'], 'action': 'approve', 'minutes': 120})
        check('the leader counts 2 h of it from the inbox', s == 200, (s, b))
        s, b = call('POST', '/approvals/decide', owner, {'kind': 'outside', 'id': made['entry'], 'action': 'reject'})
        check('decided once: a second answer is refused', s == 409, (s, (b or {}).get('code')))

        hist = data(call('GET', '/attendance/history?limit=30', mike)[1])
        rows = hist.get('entries', hist) if isinstance(hist, dict) else hist
        e = next((r for r in rows or [] if isinstance(r, dict) and r['id'] == made['entry']), {})
        check('it counts 8 h + 2 h = 10 h now', e.get('paidMinutes') == 600, e.get('paidMinutes'))
        s, b = call('GET', '/attendance/outside/pending', owner)
        check('and it is no longer asked about', not any(r['id'] == made['entry'] for r in data(b) or []), s)
    finally:
        if made['entry']:
            call('DELETE', f"/attendance/entries/{made['entry']}", owner)
        if made['hours']:
            call('DELETE', f"/employees/time-off/{made['hours']}/manage", owner)
        print('cleanup done')


if __name__ == '__main__':
    try:
        main()
    finally:
        print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)
