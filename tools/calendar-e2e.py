#!/usr/bin/env python3
"""
The company calendar — end to end over real HTTP (packages/shared/src/calendar).

LOCAL ONLY: the local API and the seed-demo organization (client@ / manager@ / mike@ / karim@example.com,
password123). Never point it at production. Uses the local database (docker psql) only to make a reminder
due now and to read a stored token hash. Restores every setting it changed and deletes what it made.

  python3 tools/calendar-e2e.py

Each check prints PASS/FAIL; the exit code is the number of failures.
"""
import datetime as dt, json, subprocess, time, urllib.error, urllib.request

API = 'http://localhost:4000/api/v1'
PW = 'password123'
fails = 0
made_events: list[str] = []
made_holidays: list[str] = []
made_leave: list[str] = []


def call(method, path, token=None, body=None, raw=False):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                return r.status, (b.decode() if raw else json.loads(b or b'{}')), dict(r.headers)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                time.sleep(1.5 * (attempt + 1)); continue
            try: return e.code, json.loads(e.read() or b'{}'), {}
            except Exception: return e.code, {}, {}


def data(res):
    return res.get('data', res) if isinstance(res, dict) else res


def check(name, ok, detail=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  ← {str(detail)[:300]}'))
    if not ok: fails += 1


def sql(q):
    return subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-Atc', q],
                          capture_output=True, text=True).stdout.strip()


def login(email):
    for _ in range(8):
        s, r, _h = call('POST', '/auth/login', body={'email': email, 'password': PW})
        if isinstance(data(r), dict) and data(r).get('accessToken'): return data(r)['accessToken']
        time.sleep(15)
    raise SystemExit(f'cannot sign in as {email}: {r}')


# hassan: no rota, works Tue–Sat, Warehouse. mike: a DAILY rota, Warehouse too. karim: another workspace.
admin, manager, mike, karim, hassan = (login(f'{n}@example.com') for n in ['client', 'manager', 'mike', 'karim', 'hassan'])
uid = lambda email: sql(f"select id from users where email='{email}'")
MIKE, KARIM, MANAGER, HASSAN = uid('mike@example.com'), uid('karim@example.com'), uid('manager@example.com'), uid('hassan@example.com')
ORG = sql("select \"organizationId\" from users where email='client@example.com'")
before_org = sql(f"select \"weekendDays\"::text, coalesce(\"holidayCountry\",''), coalesce(\"holidayRegion\",''), country from organizations where id='{ORG}'")
SPACE = sql(f"select sa.\"spaceId\" from space_assignments sa where sa.\"userId\"='{HASSAN}' limit 1")
before_space = sql(f"select \"weekendDays\"::text, coalesce(\"holidayCountry\",'') from company_locations where id='{SPACE}'")
print(f'org {ORG} · workspace {SPACE}')

try:
    # ── settings: holidays & weekends ─────────────────────────────────────────
    s, r, _ = call('PATCH', '/calendar/settings', mike, {'weekendDays': [5, 6]})
    check('a member cannot change the organization\'s weekend', s == 403, (s, r))
    s, r, _ = call('PATCH', '/calendar/settings', admin, {'weekendDays': [0, 1, 2, 3, 4, 5, 6]})
    check('a seven-day weekend is refused', s == 400 and r.get('code') == 'WEEKEND_INVALID', (s, r))
    s, r, _ = call('PATCH', '/calendar/settings', admin, {'weekendDays': [0, 6], 'holidayCountry': 'AT', 'holidayRegion': '4'})
    check('the admin sets Austria / Upper Austria, Sat+Sun', s == 200, (s, r))
    s, r, _ = call('PATCH', '/calendar/settings', admin, {'holidayCountry': 'XX'})
    check('an unknown country is refused', s == 400 and r.get('code') == 'COUNTRY_UNKNOWN', (s, r))
    s, r, _ = call('GET', '/calendar/settings?year=2026', admin)
    st = data(r)
    check('settings list the organization and its workspaces', s == 200 and st['organization']['country'] == 'AT' and len(st['workspaces']) >= 1, (s, r))
    s, r, _ = call('GET', '/calendar/holidays?year=2026', mike)
    hol = data(r)
    check('anybody reads the holiday list; National Day is on it', s == 200 and any(h['date'] == '2026-10-26' for h in hol['holidays']), (s, r))

    # ── leave in WORKING days ────────────────────────────────────────────────
    s, r, _ = call('GET', f'/employees/{HASSAN}/time-off/count?from=2026-10-12&to=2026-10-26', hassan)
    c = data(r)
    check('hassan (works Tue–Sat): Oct 12–26 costs 10 of 15 days', s == 200 and c['calendarDays'] == 15 and c['counted'] == 10, (s, c))
    s, r, _ = call('GET', f'/employees/{MIKE}/time-off/count?from=2026-10-12&to=2026-10-26', mike)
    c = data(r)
    check('mike (a DAILY rota): his rota wins — only National Day is free', s == 200 and c['counted'] == 14, (s, c))
    s, r, _ = call('GET', f'/employees/nobody-here/time-off/count?from=2026-10-12&to=2026-10-26', admin)
    check('counting somebody outside the organization is a 404', s == 404, (s, r))

    # A workspace with a Fri+Sat weekend: the same member's Friday becomes a rest day.
    s, r, _ = call('PATCH', f'/calendar/settings/workspaces/{SPACE}', admin, {'weekendDays': [5, 6]})
    check('the admin gives the workspace a Fri+Sat weekend', s == 200, (s, r))
    s, r, _ = call('GET', f'/employees/{HASSAN}/time-off/count?from=2026-10-29&to=2026-11-01', hassan)
    c = data(r)
    check('his own week still beats the workspace weekend (Thu, Fri, Sat = 3)', s == 200 and c['counted'] == 3, (s, c))
    s, r, _ = call('GET', '/calendar/holidays?year=2026&spaceId=' + SPACE, hassan)
    check('the workspace reports its own weekend', s == 200 and data(r)['place']['weekend'] == [5, 6], (s, r))
    call('PATCH', f'/calendar/settings/workspaces/{SPACE}', admin, {'weekendDays': []})

    # A request for a weekend only is refused, with a code the screens translate.
    s, r, _ = call('POST', f'/employees/{HASSAN}/time-off', admin, {'startDate': '2027-10-31', 'endDate': '2027-11-01', 'type': 'VACATION'})
    check('a request for his days off only (Sun + All Saints Monday) is refused (LEAVE_NO_WORKING_DAYS)', s == 400 and r.get('code') == 'LEAVE_NO_WORKING_DAYS', (s, r))
    s, r, _ = call('POST', f'/employees/{HASSAN}/time-off', admin, {'startDate': '2027-03-01', 'endDate': '2027-03-07', 'type': 'VACATION'})
    t = data(r)
    if isinstance(t, dict) and t.get('id'): made_leave.append(t['id'])
    check('a request stores what it costs (workingDays)', s in (200, 201) and t.get('workingDays') == 5, (s, r))

    # A company day changes the count, and only after it exists.
    s, r, _ = call('POST', '/calendar/holidays', admin, {'date': '2027-03-03', 'name': 'E2E company day', 'days': 1})
    hid = data(r).get('id') if s in (200, 201) else None
    if hid: made_holidays.append(hid)
    s2, r2, _ = call('GET', f'/employees/{HASSAN}/time-off/count?from=2027-03-01&to=2027-03-07', hassan)
    check('a company day off makes the same week cost 4', s in (200, 201) and data(r2)['counted'] == 4, (s, r, r2))
    s, r, _ = call('POST', '/calendar/holidays', mike, {'date': '2027-03-04', 'name': 'sneaky'})
    check('a member cannot add a company day', s == 403, (s, r))

    # ── events, invitations, answers ─────────────────────────────────────────
    start = (dt.datetime.utcnow() + dt.timedelta(days=3)).replace(hour=13, minute=0, second=0, microsecond=0)
    ev = {'title': 'E2E client review', 'startAt': start.isoformat() + 'Z', 'endAt': (start + dt.timedelta(minutes=30)).isoformat() + 'Z',
          'meetingUrl': 'https://zoom.us/j/123', 'reminders': [10, 1440], 'attendeeIds': [MIKE]}
    s, r, _ = call('POST', '/calendar/events', hassan, {**ev, 'meetingUrl': 'javascript:alert(1)'})
    check('a javascript: meeting link is refused', s == 400, (s, r))
    s, r, _ = call('POST', '/calendar/events', hassan, {**ev, 'attendeeIds': ['does-not-exist']})
    check('inviting somebody who is not a colleague is refused', s == 400 and r.get('code') == 'EVENT_PERSON_UNKNOWN', (s, r))
    s, r, _ = call('POST', '/calendar/events', hassan, {**ev, 'organizationId': 'other'})
    check('a body field the API does not know is refused (no org from the body)', s == 400, (s, r))
    s, r, _ = call('POST', '/calendar/events', hassan, ev)
    e = data(r)
    if isinstance(e, dict) and e.get('id'): made_events.append(e['id'])
    check('hassan makes an appointment and invites mike', s in (200, 201) and e.get('canEdit') and len(e.get('attendees', [])) == 2, (s, r))
    EID = e.get('id')

    s, r, _ = call('GET', f'/calendar/events/{EID}', manager)
    check('somebody not on it cannot read it (404, not 403)', s == 404, (s, r))
    s, r, _ = call('PATCH', f'/calendar/events/{EID}', mike, {'title': 'hijack'})
    check('an invitee cannot change it', s == 403 and r.get('code') == 'EVENT_NOT_ORGANIZER', (s, r))
    s, r, _ = call('POST', f'/calendar/events/{EID}/respond', mike, {'response': 'ACCEPTED'})
    check('mike accepts', s in (200, 201), (s, r))
    inbox = sql(f"select count(*) from notification_deliveries where \"recipientId\"='{HASSAN}' and \"eventType\"='calendar.responded'")
    check('hassan is told mike is coming (bell)', inbox != '0', inbox)

    frm, to = start.date().isoformat(), (start.date() + dt.timedelta(days=1)).isoformat()
    s, r, _ = call('GET', f'/calendar?from={frm}&to={to}', mike)
    items = data(r).get('items', []) if s == 200 else []
    check('the event is on mike\'s calendar with his answer', any(i['kind'] == 'event' and i['status'] == 'ACCEPTED' for i in items), (s, r))
    s, r, _ = call('GET', f'/calendar?from=2026-01-01&to=2026-12-31', mike)
    check('a window over 62 days is refused', s == 400, (s, r))

    # Moving it asks everybody again.
    s, r, _ = call('PATCH', f'/calendar/events/{EID}', hassan, {'startAt': (start + dt.timedelta(hours=1)).isoformat() + 'Z', 'endAt': (start + dt.timedelta(hours=1, minutes=30)).isoformat() + 'Z'})
    me = [a for a in data(r).get('attendees', []) if a['userId'] == MIKE] if s == 200 else []
    check('moving the time puts mike back to "not answered"', me and me[0]['response'] == 'PENDING', (s, r))

    # ── reminders ────────────────────────────────────────────────────────────
    sql(f"update calendar_attendees set \"nextRemindAt\"=now() - interval '1 second' where \"eventId\"='{EID}' and \"userId\"='{HASSAN}'")
    sent = '0'
    for _ in range(14):
        time.sleep(6)
        sent = sql(f"select count(*) from notification_deliveries where \"recipientId\"='{HASSAN}' and \"eventType\"='calendar.reminder' and payload->>'eventId'='{EID}'")
        if sent != '0': break
    check('the minute sweep sends a due reminder once', sent == '1', sent)
    nxt = sql(f"select \"nextRemindAt\" > now() from calendar_attendees where \"eventId\"='{EID}' and \"userId\"='{HASSAN}'")
    check('…and moves on to the next one', nxt == 't', nxt)
    s, r, _ = call('POST', f'/calendar/events/{EID}/snooze', hassan, {'minutes': 10})
    check('snooze sets the next reminder ten minutes out', s in (200, 201), (s, r))

    # ── finding a time ───────────────────────────────────────────────────────
    s, r, _ = call('POST', '/calendar/free-slots', hassan, {'userIds': [MIKE], 'durationMin': 30, 'days': 7})
    check('find-a-time returns free slots', s in (200, 201) and isinstance(data(r), list), (s, r))
    s, r, _ = call('POST', '/calendar/availability', hassan, {'userIds': [MIKE], 'from': start.isoformat() + 'Z', 'to': (start + dt.timedelta(hours=8)).isoformat() + 'Z'})
    av = data(r) if s in (200, 201) else []
    check('availability shows times only, never titles', s in (200, 201) and 'title' not in json.dumps(av), (s, r))

    # ── the one-way feed ─────────────────────────────────────────────────────
    s, r, _ = call('POST', '/calendar/feed', mike)
    path = data(r).get('path', '') if s in (200, 201) else ''
    check('mike makes a private link', path.startswith('/api/v1/calendar-feed/'), (s, r))
    s, body, h = call('GET', path.replace('/api/v1', ''), None, raw=True)
    check('the link serves an ICS with his event', s == 200 and 'BEGIN:VCALENDAR' in body and 'E2E client review' in body and 'text/calendar' in h.get('Content-Type', ''), (s, str(body)[:200]))
    check('the token is stored only as a hash', sql(f"select count(*) from calendar_feed_tokens where \"tokenHash\"='{path.split('/')[-1][:-4]}'") == '0')
    s, _, _ = call('GET', '/calendar-feed/' + 'A' * 43 + '.ics', None, raw=True)
    check('a guessed link is a plain 404', s == 404, s)
    call('POST', '/calendar/feed', mike)
    s, _, _ = call('GET', path.replace('/api/v1', ''), None, raw=True)
    check('a new link kills the old one', s == 404, s)
    call('DELETE', '/calendar/feed', mike)

    # ── cancel ───────────────────────────────────────────────────────────────
    s, r, _ = call('DELETE', f'/calendar/events/{EID}', hassan)
    check('the organizer cancels it', s == 200, (s, r))
    s, r, _ = call('POST', f'/calendar/events/{EID}/respond', mike, {'response': 'ACCEPTED'})
    check('a canceled event cannot be answered', s == 404, (s, r))
finally:
    w, hc, hr, _c = (before_org.split('|') + ['', '', '', ''])[:4]
    sql(f"update organizations set \"weekendDays\"='{w}', \"holidayCountry\"=nullif('{hc}',''), \"holidayRegion\"=nullif('{hr}','') where id='{ORG}'")
    sw, shc = (before_space.split('|') + ['', ''])[:2]
    sql(f"update company_locations set \"weekendDays\"='{sw}', \"holidayCountry\"=nullif('{shc}','') where id='{SPACE}'")
    for e in made_events: sql(f"delete from calendar_events where id='{e}'")
    for h in made_holidays: sql(f"delete from calendar_holidays where id='{h}'")
    for l in made_leave: sql(f"delete from time_off_requests where id='{l}'")
    sql(f"delete from calendar_feed_tokens where \"userId\"='{MIKE}'")

print(f'\n{fails} failure(s)')
raise SystemExit(fails)
