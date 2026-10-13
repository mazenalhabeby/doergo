#!/usr/bin/env python3
"""
The automatic clock — end to end over real HTTP (packages/shared/src/attendance/auto-clock.ts).

LOCAL ONLY: the local API and the seed-demo organization (client@ / mike@ /
lisa@example.com, password123). Never point it at production.

The phone half (geofences, the held outbox, local notifications) cannot run
here — it is covered by apps/mobile/src/services/__tests__/auto-clock*.spec.ts.
This proves what the server does with what the phone sends:

  A. workspace settings — strict parse, read back, who may write
  B. the member's switch — who may flip it
  C. consent + the plan the phone arms from
  D. an AUTO clock-in is MARKED only when the clock is ON for the member
  E. undo — own entry only, idempotent, a resend cannot make the shift again,
     refused when not automatic / too late / work recorded
  F. "Still working" (skip the automatic rest)
  G. AUTO clock-out — marked only after the planned end; the automatic rest
     is inserted at the close unless skipped
  H. the sweeps — leader re-armed, then escalated, then a provisional close
     that the phone's later AUTO clock-out replaces
  I. no fixed shift (by arriving and leaving) — the mode and usual hours, the
     plan, marking inside/outside the hours, a departure any time, the
     workspace's hours read live and re-timing a running session, the close
     for review only when he is gone (at the last moment seen on site)

It builds its own workspace (a timezone where it is late morning, so a
10:00–18:00 shift is always running) and uses the database (docker psql) to
age entries, so nothing waits on a real eight-hour shift. Section H waits on
the one-minute sweep (up to ~5 minutes). Deletes what it made.

  python3 tools/auto-clock-e2e.py            # everything
  python3 tools/auto-clock-e2e.py --no-sweep # skip section H (fast)

Each check prints PASS/FAIL; the exit code is the number of failures.
"""
import json, subprocess, sys, time, urllib.error, urllib.request, uuid
from datetime import datetime, timedelta, timezone

API = 'http://localhost:4000/api/v1'
PW = 'password123'
WS = 'e2e-auto-clock-ws'
SHIFT = 'e2e-auto-clock-shift'
SA_MIKE = 'e2e-auto-clock-sa-mike'
RA_MIKE = 'e2e-auto-clock-ra-mike'
LAT, LNG = 47.7012, 13.6034  # nowhere near the seeded sites
SITE = {'lat': LAT, 'lng': LNG, 'accuracy': 8}
AWAY = {'lat': LAT + 0.015, 'lng': LNG, 'accuracy': 8}  # ~1.7 km: where a phone is once it has left
SWEEP = '--no-sweep' not in sys.argv
fails = 0
_last = [0.0]


def call(method, path, token=None, body=None):
    for attempt in range(8):
        gap = time.time() - _last[0]
        if gap < 0.35: time.sleep(0.35 - gap)
        _last[0] = time.time()
        req = urllib.request.Request(API + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type': 'application/json',
                                              **({'Authorization': f'Bearer {token}'} if token else {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 7:
                time.sleep(2 * (attempt + 1)); continue
            try: return e.code, json.loads(e.read() or b'{}')
            except Exception: return e.code, {}
        except Exception as e:
            return 0, {'error': str(e)}
    return 429, {}


def data(res):
    return res.get('data', res) if isinstance(res, dict) else res


def _err(res):
    """The refusal body, wherever the gateway put it (top level or under `error`)."""
    if not isinstance(res, dict): return {}
    return res['error'] if isinstance(res.get('error'), dict) else res


def code(res): return _err(res).get('code') or (res or {}).get('code')
def why(res): return (_err(res).get('params') or (res or {}).get('params') or {}).get('why')


def check(name, ok, detail=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  ← {str(detail)[:400]}'))
    if not ok: fails += 1


def sql(q):
    r = subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-v', 'ON_ERROR_STOP=1', '-Atc', q],
                       capture_output=True, text=True)
    if r.returncode: raise SystemExit(f'SQL failed: {r.stderr.strip()}\n  {q[:300]}')
    return r.stdout.strip()


def login(email):
    for _ in range(8):
        s, r = call('POST', '/auth/login', body={'email': email, 'password': PW})
        if isinstance(data(r), dict) and data(r).get('accessToken'): return data(r)['accessToken']
        time.sleep(15)
    raise SystemExit(f'cannot sign in as {email}: {s} {r}')


def iso(dt): return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
def now(): return datetime.now(timezone.utc)


def entry(eid):
    """flags | status | clockInAt | clockOutAt | provisional | reminderState | nextRemindAt | expectedOut"""
    row = sql(f"""select coalesce(array_to_string("flagReasons", ','), ''), status, "clockInAt", coalesce("clockOutAt"::text, ''),
                  "clockOutProvisional", coalesce("reminderState"::text, ''), coalesce("nextRemindAt"::text, ''), coalesce("expectedClockOutAt"::text, '')
                  from time_entries where id='{eid}'""")
    if not row: return None
    f = row.split('|')
    return {'flags': [x for x in f[0].split(',') if x], 'status': f[1], 'in': f[2], 'out': f[3],
            'provisional': f[4] == 't', 'reminder': f[5], 'nextRemindAt': f[6], 'expectedOut': f[7]}


def ts(s):  # a timestamp column (UTC, no zone) as an aware datetime
    if '.' in s:  # Postgres trims trailing zeros ("…:04.17"); older Pythons need six digits
        head, frac = s.split('.', 1)
        s = f'{head}.{frac[:6].ljust(6, "0")}'
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def clock_in(token, eid, trigger='AUTO', at=None, where=SITE):
    body = {'locationId': WS, **where, 'id': eid, 'trigger': trigger,
            'evidence': {'occurredAt': iso(at or now()), 'fix': {**where, 'fixAt': iso(at or now())}}}
    return call('POST', '/attendance/clock-in', token, body)


def clock_out(token, eid, trigger='AUTO', at=None, where=SITE, **extra):
    body = {'entryId': eid, **where, 'trigger': trigger, **extra}
    if at: body['evidence'] = {'occurredAt': iso(at)}
    return call('POST', '/attendance/clock-out', token, body)


def age(eid, clock_in_ago_min, expected_in_ago_min, expected_out_ago_min, **cols):
    """Move an open entry back in time, so a shift that "ran all day" can be closed now."""
    extra = ''.join(f', "{k}"={v}' for k, v in cols.items())
    sql(f"""update time_entries set "clockInAt"=now() at time zone 'utc' - interval '{clock_in_ago_min} minutes',
            "expectedClockInAt"=now() at time zone 'utc' - interval '{expected_in_ago_min} minutes',
            "expectedClockOutAt"=now() at time zone 'utc' - interval '{expected_out_ago_min} minutes'{extra}
            where id='{eid}'""")


def wait_for(pred, seconds=100):
    end = time.time() + seconds
    while time.time() < end:
        v = pred()
        if v: return v
        time.sleep(5)
    return pred()


# ── Setup ─────────────────────────────────────────────────────────────────
admin, mike, lisa = (login(f'{n}@example.com') for n in ['client', 'mike', 'lisa'])
ORG, MIKE_ID, CONSENT_BEFORE = sql("select \"organizationId\", id, coalesce(\"autoClockConsentAt\"::text,'') from users where email='mike@example.com'").split('|')
REMOTE = sql(f"select id from company_locations where \"organizationId\"='{ORG}' and \"isRemote\" limit 1")

# A zone where it is 11:xx right now, so a 10:00–18:00 shift is always running
# (and the planned rest, centred at 14:00, lands inside an aged entry).
off = now().hour - 11            # local = UTC - off
TZ = 'Etc/GMT' if off == 0 else (f'Etc/GMT+{off}' if off > 0 else f'Etc/GMT{off}')


def cleanup():
    sql(f"delete from breaks where \"timeEntryId\" in (select id from time_entries where \"locationId\"='{WS}')")
    sql(f"delete from shift_instances where \"spaceId\"='{WS}'")
    sql(f"delete from time_entries where \"locationId\"='{WS}'")
    sql(f"delete from activity_logs where \"eventType\"='TIME_ENTRY_AUTO_UNDONE' and \"userId\"='{MIKE_ID}' and metadata->'entry'->>'locationId'='{WS}'")
    sql(f"delete from shift_assignments where id='{RA_MIKE}'")
    sql(f"delete from space_assignments where id='{SA_MIKE}'")
    sql(f"delete from shifts where id='{SHIFT}'")
    sql(f"delete from company_locations where id='{WS}'")


# Mike must not be on the clock anywhere else for this run.
s, r = call('GET', '/attendance/status', mike)
st = data(r) or {}
if st.get('isClockedIn') or st.get('activeEntry') or st.get('currentEntry'):
    call('POST', '/attendance/clock-out', mike, {**SITE, 'earlyReason': 'auto-clock e2e setup'})
cleanup()
sql(f"""insert into company_locations (id, "organizationId", name, address, lat, lng, "geofenceRadius", timezone, "workModel",
        "geofencePolicy", kind, "enabledModules", "isActive", "isRemote", "isDefault", "createdAt", "updatedAt")
        values ('{WS}', '{ORG}', 'Auto clock [e2e]', 'E2E', {LAT}, {LNG}, 100, '{TZ}', 'SHIFT', 'STRICT', 'COMPANY',
        '["time_tracking"]', true, false, false, now(), now())""")
sql(f"""insert into shifts (id, "organizationId", "spaceId", name, "startLocal", "endLocal", "crossesMidnight", "breakMinutes",
        "graceMin", "reminderIntervalMin", "maxReminders", "flagToleranceMin", "isActive", "createdAt", "updatedAt")
        values ('{SHIFT}', '{ORG}', '{WS}', 'E2E day', '10:00', '18:00', false, 0, 10, 15, 3, 10, true, now(), now())""")
sql(f"""insert into shift_assignments (id, "organizationId", "userId", "spaceId", "shiftId", recurrence, "effectiveFrom", priority, "isActive", "createdAt", "updatedAt")
        values ('{RA_MIKE}', '{ORG}', '{MIKE_ID}', '{WS}', '{SHIFT}', 'DAILY', now() - interval '3 days', 0, true, now(), now())""")
sql(f"""insert into space_assignments (id, "organizationId", "userId", "spaceId", "isPrimary", "autoClock", "allowSecondRole", "effectiveFrom", "createdAt", "updatedAt")
        values ('{SA_MIKE}', '{ORG}', '{MIKE_ID}', '{WS}', false, false, false, now() - interval '3 days', now(), now())""")
print(f'workspace {WS} · zone {TZ} · shift 10:00–18:00 local')

SETTINGS = {'enabled': True, 'leadMinutes': 30, 'dwellMinutes': 3, 'exitGraceMinutes': 10,
            'autoRestMinutes': 30, 'leaderAfterMinutes': 25, 'closeAfterMinutes': 60}

try:
    # ── A. Workspace settings ─────────────────────────────────────────────
    print('\n— A. workspace settings')
    s, r = call('PATCH', f'/locations/{WS}', admin, {'autoClock': {**SETTINGS, 'leadMinutes': 500}})
    check('an out-of-range value is refused, not clamped', s == 400 and code(r) == 'AUTO_CLOCK_SETTING_INVALID', (s, r))
    s, r = call('PATCH', f'/locations/{WS}', admin, {'autoClock': {**SETTINGS, 'leaderAfterMinutes': 60, 'closeAfterMinutes': 30}})
    check('closing before the leader is told is refused', s == 400 and code(r) == 'AUTO_CLOCK_SETTING_INVALID', (s, r))
    s, r = call('PATCH', f'/locations/{WS}', mike, {'autoClock': SETTINGS})
    check('a worker cannot switch it on for a workspace', s in (403, 404), (s, r))
    s, r = call('PATCH', f'/locations/{REMOTE}', admin, {'autoClock': SETTINGS})
    check('the Remote bucket is refused', s in (400, 403, 404), (s, r))
    s, r = call('PATCH', f'/locations/{WS}', admin, {'autoClock': SETTINGS})
    check('the administrator switches it on', s == 200, (s, r))
    s, r = call('GET', f'/locations/{WS}', admin)
    got = (data(r) or {}).get('autoClock') or {}
    check('…and reads back exactly what was saved', all(got.get(k) == v for k, v in SETTINGS.items()), got)

    # ── B. The member's switch ────────────────────────────────────────────
    print('\n— B. the member is chosen')
    s, r = call('PATCH', f'/locations/{WS}/members/{SA_MIKE}', mike, {'autoClock': True})
    check('a worker cannot choose themselves', s in (403, 404), (s, r))
    s, r = call('PATCH', f'/locations/{WS}/members/{SA_MIKE}', admin, {'autoClock': True})
    check('the administrator chooses the member', s == 200 and sql(f"select \"autoClock\" from space_assignments where id='{SA_MIKE}'") == 't', (s, r))
    s, r = call('GET', f'/locations/{WS}/members', admin)
    rows = data(r) if isinstance(data(r), list) else (data(r) or {}).get('items') or (data(r) or {}).get('members') or []
    mine = next((x for x in rows if x.get('id') == SA_MIKE), {})
    check('the roster carries the switch', mine.get('autoClock') is True, mine or rows[:1])

    # ── C. Consent + the plan ─────────────────────────────────────────────
    print('\n— C. consent and the plan')
    sql(f"update users set \"autoClockConsentAt\"=null where id='{MIKE_ID}'")
    s, r = call('GET', '/attendance/auto-clock/plan', mike)
    p = data(r) or {}
    check('without consent the plan is empty', s == 200 and p.get('consentAt') is None and p.get('places') == [], (s, p))
    s, r = call('POST', '/attendance/auto-clock/consent', mike, {'consent': True})
    first = (data(r) or {}).get('consentAt')
    check('consent is recorded', s in (200, 201) and first, (s, r))
    time.sleep(1.1)
    s, r = call('POST', '/attendance/auto-clock/consent', mike, {'consent': True})
    check('a second yes keeps the first date', (data(r) or {}).get('consentAt') == first, (first, r))
    s, r = call('GET', '/attendance/auto-clock/plan', mike)
    p = data(r) or {}
    place = next((x for x in p.get('places') or [] if x.get('spaceId') == WS), None)
    check('the plan names the workspace', place is not None, p)
    if place:
        check('…with its pin and ring', abs(place['lat'] - LAT) < 1e-6 and place['radius'] >= 100, place)
        check('…with its settings', place['settings'].get('dwellMinutes') == 3 and place['settings'].get('enabled') is True, place['settings'])
        running = [x for x in place['shifts'] if datetime.fromisoformat(x['start'].replace('Z', '+00:00')) <= now() < datetime.fromisoformat(x['end'].replace('Z', '+00:00'))]
        check("…and today's running shift (10:00–18:00 local)", len(running) == 1, place['shifts'])
    s, r = call('GET', '/attendance/auto-clock/plan', lisa)
    check('somebody not chosen there gets nothing for it', not any(x.get('spaceId') == WS for x in (data(r) or {}).get('places') or []), r)

    # ── D. AUTO clock-in is marked only when ON ───────────────────────────
    print('\n— D. the automatic clock-in')
    E1 = str(uuid.uuid4())
    walked_in = now() - timedelta(seconds=30)
    s, r = clock_in(mike, E1, at=walked_in)
    e = entry(E1)
    check('an AUTO clock-in on site, inside the window, is accepted', s in (200, 201) and e and e['status'] == 'CLOCKED_IN', (s, r))
    check('…and marked AUTO_CLOCK_IN', e and 'AUTO_CLOCK_IN' in e['flags'], e)
    check('…dated when they walked in, not when it arrived', e and abs((ts(e['in']) - walked_in).total_seconds()) < 2, (e and e['in'], iso(walked_in)))
    if e and e['expectedOut']:
        check('…with the leader reminder armed by end + leaderAfter', e['nextRemindAt'] and ts(e['nextRemindAt']) <= ts(e['expectedOut']) + timedelta(minutes=25, seconds=1), e)
    s, r = clock_in(mike, E1, at=walked_in)
    check('a resend of the same id returns the same entry', s in (200, 201) and sql(f"select count(*) from time_entries where \"locationId\"='{WS}'") == '1', (s, r))

    # ── E. Undo ───────────────────────────────────────────────────────────
    print('\n— E. undo a drive-past')
    s, r = call('POST', f'/attendance/entries/{E1}/auto-undo', lisa, {})
    check("somebody else's entry is 404", s == 404, (s, r))
    s, r = call('POST', f'/attendance/entries/{E1}/auto-undo', mike, {'evidence': {'occurredAt': iso(now())}})
    check('the owner undoes it', s in (200, 201) and (data(r) or {}).get('undone') is True, (s, r))
    check('…the entry is gone', entry(E1) is None, entry(E1))
    check('…and an audit row says it existed', sql(f"select count(*) from activity_logs where \"eventType\"='TIME_ENTRY_AUTO_UNDONE' and \"resourceId\"='{E1}'") == '1')
    s, r = call('POST', f'/attendance/entries/{E1}/auto-undo', mike, {})
    check('a replayed undo answers done', s in (200, 201) and (data(r) or {}).get('undone') is True, (s, r))
    s, r = clock_in(mike, E1, at=walked_in)
    check('a resend of the undone clock-in is 409 AUTO_CLOCK_UNDONE, never a second shift',
          s == 409 and code(r) == 'AUTO_CLOCK_UNDONE' and entry(E1) is None, (s, r))

    E2 = str(uuid.uuid4())
    clock_in(mike, E2)
    sql(f"update time_entries set \"clockInAt\"=now() at time zone 'utc' - interval '20 minutes' where id='{E2}'")
    s, r = call('POST', f'/attendance/entries/{E2}/auto-undo', mike, {})
    check('undo after dwell + 10 + 2 min is refused TOO_LATE', s == 400 and code(r) == 'AUTO_CLOCK_UNDO_NOT_ALLOWED' and why(r) == 'TOO_LATE', (s, r))
    sql(f"update time_entries set \"clockInAt\"=now() at time zone 'utc' - interval '1 minute' where id='{E2}'")
    s, r = call('POST', '/attendance/breaks/start', mike, {'type': 'SHORT'})
    check('a rest can be started', s in (200, 201), (s, r))
    s, r = call('POST', f'/attendance/entries/{E2}/auto-undo', mike, {})
    check('undo once a rest exists is refused WORK_RECORDED', s == 400 and why(r) == 'WORK_RECORDED', (s, r))
    call('POST', '/attendance/breaks/end', mike, {})
    s, r = clock_out(mike, E2, trigger='MANUAL', earlyReason='e2e')
    check('closed by hand', s in (200, 201) and entry(E2)['status'] != 'CLOCKED_IN', (s, r))
    s, r = call('POST', f'/attendance/entries/{E2}/auto-undo', mike, {})
    check('undo of a closed shift is refused', s == 400 and why(r) in ('CLOSED', 'WORK_RECORDED'), (s, r))

    # Not chosen → an AUTO step is an ordinary one (never refused, never marked).
    call('PATCH', f'/locations/{WS}/members/{SA_MIKE}', admin, {'autoClock': False})
    E3 = str(uuid.uuid4())
    s, r = clock_in(mike, E3)
    e = entry(E3)
    check('member not chosen: AUTO is accepted as an ordinary clock-in', s in (200, 201) and e and 'AUTO_CLOCK_IN' not in e['flags'], (s, r, e))
    s, r = call('POST', f'/attendance/entries/{E3}/auto-undo', mike, {})
    check('…and cannot be undone as automatic', s == 400 and why(r) == 'NOT_AUTOMATIC', (s, r))
    clock_out(mike, E3, trigger='MANUAL', earlyReason='e2e')
    call('PATCH', f'/locations/{WS}/members/{SA_MIKE}', admin, {'autoClock': True})

    # Consent withdrawn → ordinary too, and the plan empties.
    call('POST', '/attendance/auto-clock/consent', mike, {'consent': False})
    s, r = call('GET', '/attendance/auto-clock/plan', mike)
    check('withdrawing consent empties the plan', (data(r) or {}).get('places') == [], r)
    E4 = str(uuid.uuid4())
    s, r = clock_in(mike, E4)
    e = entry(E4)
    check('consent withdrawn: AUTO is an ordinary clock-in', s in (200, 201) and e and 'AUTO_CLOCK_IN' not in e['flags'], (s, r, e))
    clock_out(mike, E4, trigger='MANUAL', earlyReason='e2e')
    call('POST', '/attendance/auto-clock/consent', mike, {'consent': True})

    # Workspace off → ordinary.
    call('PATCH', f'/locations/{WS}', admin, {'autoClock': {**SETTINGS, 'enabled': False}})
    E5 = str(uuid.uuid4())
    s, r = clock_in(mike, E5)
    e = entry(E5)
    check('workspace switched off: AUTO is an ordinary clock-in', s in (200, 201) and e and 'AUTO_CLOCK_IN' not in e['flags'], (s, r, e))
    clock_out(mike, E5, trigger='MANUAL', earlyReason='e2e')
    call('PATCH', f'/locations/{WS}', admin, {'autoClock': SETTINGS})

    # ── F. "Still working" ────────────────────────────────────────────────
    print('\n— F. skip the automatic rest')
    E6 = str(uuid.uuid4())
    clock_in(mike, E6)
    check('(automatic again once everything is back on)', 'AUTO_CLOCK_IN' in (entry(E6) or {}).get('flags', []), entry(E6))
    s, r = call('POST', f'/attendance/entries/{E6}/auto-rest/skip', lisa, {})
    check("somebody else's shift is 404", s == 404, (s, r))
    s, r = call('POST', f'/attendance/entries/{E6}/auto-rest/skip', mike, {'evidence': {'occurredAt': iso(now())}})
    check('"Still working" is recorded', s in (200, 201) and (data(r) or {}).get('skipped') is True
          and sql(f"select \"autoRestSkippedAt\" is not null from time_entries where id='{E6}'") == 't', (s, r))
    s, r = call('POST', f'/attendance/entries/{E6}/auto-rest/skip', mike, {})
    check('…a second tap answers done', s in (200, 201) and (data(r) or {}).get('skipped') is True, (s, r))

    # ── G. AUTO clock-out + the automatic rest ────────────────────────────
    print('\n— G. the automatic clock-out')
    # Skipped rest: a full day, left after the end → AUTO_CLOCK_OUT, no automatic rest.
    age(E6, 480, 480, 5)
    # Sent from OUTSIDE, as a real phone sends it — it fires because they left.
    s, r = clock_out(mike, E6, at=now() - timedelta(minutes=1), where=AWAY)
    e = entry(E6)
    check('leaving after the planned end is marked AUTO_CLOCK_OUT', s in (200, 201) and e and 'AUTO_CLOCK_OUT' in e['flags'], (s, r, e))
    check('…and is not flagged outside the geofence (nobody has to review it)', e and 'OUTSIDE_GEOFENCE_OUT' not in e['flags'], e)
    check('…dated when they left', e and e['out'] and abs((ts(e['out']) - (now() - timedelta(minutes=1))).total_seconds()) < 15, e)
    check('…and a skipped rest is not inserted', e and sql(f"select count(*) from breaks where \"timeEntryId\"='{E6}' and reason='AUTO_REST'") == '0'
          and 'AUTO_REST' not in e['flags'], e)

    # Not skipped: the rest is a row, centred in the planned shift.
    E7 = str(uuid.uuid4())
    clock_in(mike, E7)
    age(E7, 480, 480, 5)
    s, r = clock_out(mike, E7)
    e = entry(E7)
    rest = sql(f"select \"durationMinutes\", \"startedAt\" from breaks where \"timeEntryId\"='{E7}' and reason='AUTO_REST'")
    check('a full day with no rest gets the automatic rest at the close', s in (200, 201) and rest.split('|')[0] == '30', (s, rest))
    check('…flagged AUTO_REST (and not MISSED_REST)', e and 'AUTO_REST' in e['flags'] and 'MISSED_REST' not in e['flags'], e)
    if rest:
        mid = ts(rest.split('|')[1]) + timedelta(minutes=15)
        check('…centred in the planned shift', abs((mid - (now() - timedelta(minutes=(480 + 5) / 2))).total_seconds()) < 120, rest)

    # Before the end → an ordinary clock-out (early), never refused.
    E8 = str(uuid.uuid4())
    clock_in(mike, E8)
    s, r = clock_out(mike, E8, earlyReason='e2e')
    e = entry(E8)
    check('an AUTO clock-out before the planned end is an ordinary one', s in (200, 201) and e and 'AUTO_CLOCK_OUT' not in e['flags'], (s, r, e))

    # ── H. The sweeps ─────────────────────────────────────────────────────
    if SWEEP:
        print('\n— H. still inside after the end (waits on the 1-minute sweep)')
        E9 = str(uuid.uuid4())
        clock_in(mike, E9)
        # 5 min past the end: the leader is not due until end + 25 → re-armed, no nudge.
        age(E9, 300, 300, 5, nextRemindAt="now() at time zone 'utc' - interval '1 minute'")
        e = wait_for(lambda: (lambda x: x if x and x['nextRemindAt'] and ts(x['nextRemindAt']) > now() else None)(entry(E9)))
        check('before end + leaderAfter: re-armed for that moment, no worker nudge',
              e and e['reminder'] not in ('REMINDED', 'ESCALATED') and abs((ts(e['nextRemindAt']) - (ts(e['expectedOut']) + timedelta(minutes=25))).total_seconds()) < 5, e)
        # 30 min past the end: the leader is told.
        age(E9, 300, 300, 30, nextRemindAt="now() at time zone 'utc' - interval '1 minute'")
        e = wait_for(lambda: (lambda x: x if x and x['reminder'] == 'ESCALATED' else None)(entry(E9)))
        check('after end + leaderAfter: escalated to the leader', e and e['reminder'] == 'ESCALATED' and e['status'] == 'CLOCKED_IN', e)
        # 65 min past the end: closed provisionally.
        age(E9, 300, 300, 65)
        e = wait_for(lambda: (lambda x: x if x and x['status'] != 'CLOCKED_IN' else None)(entry(E9)))
        check('after end + closeAfter: closed provisionally', e and e['provisional'] and 'CLOCK_OUT_PROVISIONAL' in e['flags'], e)
        left = now() - timedelta(minutes=40)
        s, r = clock_out(mike, E9, at=left)
        e = entry(E9)
        check("the phone's later AUTO clock-out replaces the provisional one", s in (200, 201) and e and not e['provisional']
              and abs((ts(e['out']) - left).total_seconds()) < 15 and 'AUTO_CLOCK_OUT' in e['flags'], (s, r, e))
    else:
        print('\n— H. skipped (--no-sweep)')

    # ── I. No fixed shift: clocked by arriving and leaving ────────────────
    print('\n— I. no fixed shift (by arriving and leaving)')
    s, r = call('GET', '/attendance/status', mike)
    st = data(r) or {}
    if st.get('isClockedIn'):
        call('POST', '/attendance/clock-out', mike, {**SITE, 'earlyReason': 'presence e2e'})
    # No rota any more: called in. Its already-made instances go too, or one still matches today.
    sql(f"delete from shift_assignments where id='{RA_MIKE}'")
    sql(f"delete from shift_instances where \"spaceId\"='{WS}'")
    # …and no weekly schedule either (the demo seed gives Mike one): put back in `finally`.
    PAUSED_SCHEDULES = sql(f"update technician_schedules set \"isActive\"=false where \"technicianId\"='{MIKE_ID}' and \"isActive\" returning id").split()
    local_h = (now().hour - off) % 24
    INSIDE = {'from': f'{(local_h - 1) % 24:02d}:00', 'to': f'{(local_h + 2) % 24:02d}:00'}
    OUTSIDE = {'from': f'{(local_h + 6) % 24:02d}:00', 'to': f'{(local_h + 8) % 24:02d}:00'}
    path = f'/locations/{WS}/members/{SA_MIKE}'

    s, r = call('PATCH', path, admin, {'autoClock': True, 'autoClockMode': 'PRESENCE'})
    row = sql(f"select \"autoClockMode\", coalesce(\"autoClockStartWindow\"::text,'') from space_assignments where id='{SA_MIKE}'").split('|')
    check('switching to arriving and leaving saves the mode (usual hours suggested from his clock-ins here, or any time)', s in (200, 201) and row[0] == 'PRESENCE', (s, r, row))
    s, r = call('PATCH', path, admin, {'autoClockStartWindow': {'from': '19:00', 'to': '19:00'}})
    check('a window of two equal times is refused, coded', s == 400 and code(r) == 'AUTO_CLOCK_SETTING_INVALID', (s, r))
    s, r = call('PATCH', path, mike, {'autoClockMode': 'SHIFT'})
    check('the member cannot change it himself', s == 403, (s, r))
    s, r = call('PATCH', path, admin, {'autoClockStartWindow': INSIDE})
    check('usual hours saved', s in (200, 201), (s, r))

    s, r = call('GET', '/attendance/auto-clock/plan', mike)
    pl = next((p for p in (data(r) or {}).get('places', []) if p.get('spaceId') == WS), None)
    check('the plan carries presence: usual hours, zone, the workspace hours', pl and (pl.get('presence') or {}).get('startWindow') == INSIDE
          and (pl.get('presence') or {}).get('noShiftMinutes') == 480 and (pl.get('presence') or {}).get('timezone') == TZ, pl)

    P1 = str(uuid.uuid4())
    arrived = now() - timedelta(seconds=20)  # after his last step (a step dated before it is out of order)
    s, r = clock_in(mike, P1, at=arrived)
    e = entry(P1)
    check('AUTO clock-in inside the usual hours with no shift is marked automatic', s in (200, 201) and e and 'AUTO_CLOCK_IN' in e['flags'], (s, r, e))
    check('…the leader is due at arrival + the workspace hours + leaderAfter (no worker nudge)',
          e and e['nextRemindAt'] and abs((ts(e['nextRemindAt']) - (ts(e['in']) + timedelta(minutes=480 + 25))).total_seconds()) < 5, e)

    s, r = call('PATCH', f'/locations/{WS}', admin, {'noShiftDailyMinutes': 600})
    e = entry(P1)
    check('the workspace hours are read live: the plan says 600 at once', s in (200, 201) and
          next((p for p in (data(call('GET', '/attendance/auto-clock/plan', mike)[1]) or {}).get('places', []) if p.get('spaceId') == WS), {}).get('presence', {}).get('noShiftMinutes') == 600, (s, r))

    s, r = clock_out(mike, P1, at=now())
    e = entry(P1)
    check('AUTO clock-out at any time after clocking in is marked automatic (no planned end to wait for)', s in (200, 201) and e and 'AUTO_CLOCK_OUT' in e['flags'], (s, r, e))

    call('PATCH', path, admin, {'autoClockStartWindow': OUTSIDE})
    P2 = str(uuid.uuid4())
    s, r = clock_in(mike, P2, at=now())
    e = entry(P2)
    check('AUTO clock-in OUTSIDE the usual hours is an ordinary clock-in (the phone asks; never marked)', s in (200, 201) and e and 'AUTO_CLOCK_IN' not in e['flags'], (s, r, e))
    clock_out(mike, P2, trigger='MANUAL', earlyReason='e2e')

    # A session not on the automatic clock: changing the workspace hours re-times it, running.
    call('PATCH', path, admin, {'autoClock': False})
    P3 = str(uuid.uuid4())
    clock_in(mike, P3, trigger='MANUAL')
    before = entry(P3)
    call('PATCH', f'/locations/{WS}', admin, {'noShiftDailyMinutes': 720})
    after = entry(P3)
    check('changing the hours moves a running session\'s "forgot to clock out?" to clock-in + the new hours',
          after and after['nextRemindAt'] and abs((ts(after['nextRemindAt']) - (ts(after['in']) + timedelta(minutes=720))).total_seconds()) < 5, (before, after))
    clock_out(mike, P3, trigger='MANUAL', earlyReason='e2e')

    if SWEEP:
        # Gone, phone silent: closed for review at the last moment it saw him on site.
        call('PATCH', path, admin, {'autoClock': True, 'autoClockStartWindow': None})
        call('PATCH', f'/locations/{WS}', admin, {'noShiftDailyMinutes': 480})
        P4 = str(uuid.uuid4())
        clock_in(mike, P4, at=now())
        sql(f"""update time_entries set "clockInAt"=now() at time zone 'utc' - interval '600 minutes',
                "lastSeenAt"=now() at time zone 'utc' - interval '90 minutes', presence='ON_SITE',
                "nextRemindAt"=now() at time zone 'utc' + interval '1 day' where id='{P4}'""")
        seen = sql(f"select \"lastSeenAt\" from time_entries where id='{P4}'")
        e = wait_for(lambda: (lambda x: x if x and x['status'] != 'CLOCKED_IN' else None)(entry(P4)), 150)
        basis = sql(f"select coalesce(\"clockOutBasis\",'') from time_entries where id='{P4}'")
        check('past the hours + closeAfter and silent: closed for review at the last moment seen on site',
              e and e['provisional'] and basis == 'LAST_SEEN' and abs((ts(e['out']) - ts(seen)).total_seconds()) < 5, (e, basis, seen))
        # Still heard from on site: never closed.
        P5 = str(uuid.uuid4())
        clock_in(mike, P5, at=now())
        sql(f"""update time_entries set "clockInAt"=now() at time zone 'utc' - interval '600 minutes',
                "lastSeenAt"=now() at time zone 'utc' - interval '2 minutes', presence='ON_SITE',
                "nextRemindAt"=now() at time zone 'utc' + interval '1 day' where id='{P5}'""")
        time.sleep(75)
        e = entry(P5)
        check('still reported on site: never closed (the leader is told instead)', e and e['status'] == 'CLOCKED_IN', e)
        clock_out(mike, P5, trigger='MANUAL', earlyReason='e2e')
finally:
    if 'PAUSED_SCHEDULES' in globals() and PAUSED_SCHEDULES:
        sql("update technician_schedules set \"isActive\"=true where id in (" + ','.join(f"'{i}'" for i in PAUSED_SCHEDULES) + ")")
    s, r = call('GET', '/attendance/status', mike)
    cleanup()
    sql(f"update users set \"autoClockConsentAt\"={('null' if not CONSENT_BEFORE else repr(CONSENT_BEFORE))} where id='{MIKE_ID}'")

print(f'\n{fails} failure(s)')
sys.exit(fails)
