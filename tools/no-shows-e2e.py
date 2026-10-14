#!/usr/bin/env python3
"""
No-shows that end — over real HTTP (shared attendance/no-show.ts).

  python3 tools/no-shows-e2e.py        (gateway on localhost:4000, seed-demo data)

⚠️ LOCAL ONLY. It decides a few open no-shows of the demo org and REOPENS every
one it decided at the end (also on failure); the "They were here" check adds
hours for one missed shift, then deletes them and puts that no-show back
(the last step through the local database, since nothing in the product
turns a shift somebody worked back into a no-show).

  A. the inbox shows a run of misses as ONE item, with its facts
  B. excused carries what happened; absent is a state; reopen goes back to waiting
  C. a whole run is decided at once — the server finds the run
  D. the record: one row per person, the counts move with the decisions
  E. "They were here": adding the hours closes the no-show by itself
"""
import atexit
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

BASE = 'http://localhost:4000/api/v1'
PASSWORD = 'password123'
failures = 0
_sessions = []
_reopen = []


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'content-type': 'application/json'}
    if token:
        headers['authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {}
        except ValueError:
            return e.code, {}


def data(b):
    return b.get('data', b) if isinstance(b, dict) else b


def check(label, ok, detail=None):
    global failures
    print(('PASS ' if ok else 'FAIL ') + label + ('' if ok or detail is None else f'  → {detail}'))
    if not ok:
        failures += 1


def login(email):
    for _ in range(20):
        s, b = call('POST', '/auth/login', None, {'email': email, 'password': PASSWORD})
        d = data(b) if isinstance(b, dict) else {}
        if d.get('accessToken'):
            _sessions.append((d['accessToken'], d['refreshToken']))
            return d['accessToken'], d['user']
        time.sleep(10)
    sys.exit(f'cannot sign in as {email}')


@atexit.register
def _cleanup():
    if _reopen and _sessions:
        owner = _sessions[0][0]
        for nid in set(_reopen):
            call('PATCH', f'/attendance/no-shows/{nid}', owner, {'action': 'reopen'})
    for access, refresh in _sessions:
        call('POST', '/auth/logout', access, {'refreshToken': refresh})


def psql(sql):
    return subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-tAc', sql],
                          capture_output=True, text=True, check=True).stdout.strip()


def open_list(token):
    return data(call('GET', '/attendance/no-shows?days=30&open=true', token)[1]) or []


def main():
    owner, _ = login('client@example.com')

    print('\n— A. the inbox: one item per run of misses')
    rows = open_list(owner)
    check('there are open no-shows in the demo org to work with', len(rows) > 0, len(rows))
    if not rows:
        return
    latest = [r for r in rows if r.get('runLatest') is not False]
    s, inbox = call('GET', '/approvals', owner)
    items = [i for i in data(inbox).get('items', []) if i['kind'] == 'noShow']
    check('the inbox shows one item per run, not one per day', len(items) == len(latest) and len(items) < len(rows), (len(items), len(latest), len(rows)))
    runs = [i for i in items if (i['data'].get('runCount') or 0) > 1]
    check('a run carries its length, its days and a likely reason', bool(runs) and all(i['data'].get('runFrom') and i['data'].get('hint') for i in runs), [i['data'] for i in runs[:1]])
    check('every item carries the facts a leader decides on (reminders, workspace zone)', all('reminderCount' in i['data'] and 'timezone' in i['data'] for i in items))

    single = next((i for i in items if not i['data'].get('runCount')), None)
    print('\n— B. excused with what happened · absent · reopen')
    if single:
        s, b = call('POST', '/approvals/decide', owner, {'kind': 'noShow', 'id': single['id'], 'action': 'approve', 'reasonCode': 'SICK', 'reason': 'e2e'})
        _reopen.append(single['id'])
        check('excused from the inbox', s == 200, (s, b))
        row = next((r for r in data(call('GET', '/attendance/no-shows?days=30', owner)[1]) if r['id'] == single['id']), {})
        check('…and it says why: SICK, decided by a person', row.get('state') == 'EXCUSED' and row.get('closeReason') == 'SICK' and row.get('closedAutomatically') is False, row)
        s, b = call('POST', '/approvals/decide', owner, {'kind': 'noShow', 'id': single['id'], 'action': 'reject'})
        check('a decided one cannot be decided again', s >= 400, s)
        s, _ = call('PATCH', f"/attendance/no-shows/{single['id']}", owner, {'action': 'reopen'})
        check('reopen puts it back to waiting (in the inbox, nobody nudged)', s == 200 and any(r['id'] == single['id'] and r['state'] == 'ESCALATED' for r in open_list(owner)), s)
        s, b = call('POST', '/approvals/decide', owner, {'kind': 'noShow', 'id': single['id'], 'action': 'reject'})
        row = next((r for r in data(call('GET', '/attendance/no-shows?days=30', owner)[1]) if r['id'] == single['id']), {})
        check('absent is its own state', s == 200 and row.get('state') == 'ABSENT', (s, row.get('state')))
        call('PATCH', f"/attendance/no-shows/{single['id']}", owner, {'action': 'reopen'})
    else:
        print('SKIP B (no single no-show)')

    print('\n— C. a whole run at once')
    if runs:
        run = runs[0]
        want = run['data']['runCount']
        mates = [r for r in rows if r['userId'] == run['subject']['id'] and r['spaceId'] == run['space']['id']
                 and run['data']['runFrom'] <= r['localDate'] <= run['data']['runTo']]
        s, b = call('POST', '/approvals/decide', owner, {'kind': 'noShow', 'id': run['id'], 'action': 'reject', 'wholeRun': True})
        _reopen.extend(r['id'] for r in mates)
        decided = {r['id']: r['state'] for r in data(call('GET', '/attendance/no-shows?days=30', owner)[1])}
        check(f'absent for all {want} days in one decision', s == 200 and len(mates) == want and all(decided.get(r['id']) == 'ABSENT' for r in mates), (s, len(mates), [decided.get(r['id']) for r in mates]))
        s, inbox = call('GET', '/approvals', owner)
        check('and the run left the inbox', not any(i['id'] == run['id'] for i in data(inbox)['items']))

        print('\n— D. the record')
        s, b = call('GET', '/attendance/no-shows/summary?days=30', owner)
        person = next((p for p in data(b) if p['userId'] == run['subject']['id']), None)
        check('one row per person, with the days and the counts', s == 200 and person and person['absent'] >= want and len(person['days']) <= 7, person and {k: person[k] for k in ('absent', 'excused', 'settled', 'open')})
        check('the decided days are listed with Reopen', person and sum(1 for c in person['closed'] if c['state'] == 'ABSENT') >= want)
        for r in mates:
            call('PATCH', f"/attendance/no-shows/{r['id']}", owner, {'action': 'reopen'})
        check('reopened, the run is back as one item', any(i['id'] == run['id'] for i in data(call('GET', '/approvals', owner)[1])['items']))
    else:
        print('SKIP C/D (no run of misses)')

    print('\n— E. "They were here"')
    target = next((r for r in rows if r.get('timezone') and r['expectedClockOutAt'] < datetime.now(ZoneInfo('UTC')).isoformat()), None)
    if not target:
        print('SKIP E')
        return
    tz = ZoneInfo(target['timezone'])
    start = datetime.fromisoformat(target['expectedClockInAt'].replace('Z', '+00:00')).astimezone(tz)
    end = datetime.fromisoformat(target['expectedClockOutAt'].replace('Z', '+00:00')).astimezone(tz)
    day_entries = psql(f"select count(*) from time_entries where \"userId\"='{target['userId']}' and \"clockInAt\"::date between '{start:%Y-%m-%d}'::date - 1 and '{start:%Y-%m-%d}'::date + 1")
    if day_entries != '0':
        print('SKIP E (that person already has hours that day)')
        return
    s, b = call('POST', '/attendance/entries/manual', owner, {
        'userId': target['userId'], 'locationId': target['spaceId'], 'startDate': f'{start:%Y-%m-%d}', 'endDate': f'{start:%Y-%m-%d}',
        'startTime': f'{start:%H:%M}', 'endTime': f'{end:%H:%M}', 'reason': 'e2e: they were here',
    })
    try:
        check('the office adds the hours for the missed shift', s in (200, 201) and data(b).get('created') == 1, (s, b))
        state = psql(f"select state from shift_instances where id='{target['id']}'")
        check('…and the no-show closed itself: they were present', state == 'PRESENT', state)
    finally:
        psql(f"delete from time_entries where \"userId\"='{target['userId']}' and \"editReason\"='e2e: they were here'")
        psql(f"update shift_instances set state='ESCALATED', \"timeEntryId\"=null where id='{target['id']}'")
        check('the hours are removed and the no-show is back', psql(f"select state from shift_instances where id='{target['id']}'") == 'ESCALATED')


if __name__ == '__main__':
    try:
        main()
    finally:
        print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)
