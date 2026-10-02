#!/usr/bin/env python3
"""
A crew scene to look at, on the LOCAL demo org (never prod): crew mode on, one
job in work — Tobias leads, Priya joined and stopped on her own, Conor clocked
in but not on it. Prints the job id. Reuses crew-e2e.py's sign-in cache.
"""
import json, sys, time, urllib.request, urllib.error
API = 'http://localhost:4000/api/v1'
c = json.load(open('/tmp/crew-e2e-tokens.json'))
tok = {k: v['token'] for k, v in c.items()}; uid = {k: v['id'] for k, v in c.items()}
T, P, C, O, OWN = 'tobias.okafor', 'priya.rhodes', 'conor.devlin', 'mara.kellner', 'douglas.ferriby'

def call(m, p, t, b=None):
    r = urllib.request.Request(API + p, method=m, data=json.dumps(b).encode() if b is not None else None,
                               headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t})
    for a in range(5):
        try:
            with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read() or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(3 + a * 3); continue
            return e.code, json.loads(e.read() or b'{}')
data = lambda r: r[1].get('data', r[1])

call('PATCH', '/organizations/profile', tok[OWN], {'crewMode': True})
for k in [T, P, C]:
    st = data(call('GET', '/attendance/status', tok[k]))
    if not st.get('isClockedIn'):
        loc = data(call('GET', '/attendance/clock-in-locations', tok[k]))[0]
        call('POST', '/attendance/clock-in', tok[k], {'locationId': loc['id'], 'lat': loc.get('lat') or 0, 'lng': loc.get('lng') or 0, 'accuracy': 5})
    for t in (data(call('GET', '/tasks?limit=100', tok[k])) or []):
        if isinstance(t, dict) and t.get('status') in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'):
            call('PATCH', f"/tasks/{t['id']}/status", tok[O], {'status': 'BLOCKED', 'reason': 'Parked for the crew scene'})
loc = data(call('GET', '/attendance/clock-in-locations', tok[T]))[0]
HERE = {'lat': loc.get('lat') or 51.5, 'lng': loc.get('lng') or -0.12, 'accuracy': 5}
s, b = call('POST', '/tasks', tok[O], {'title': 'Rooftop AC install — crew', 'spaceId': loc['id'], 'priority': 'HIGH',
          'description': 'Three units on the roof; crane booked for 09:00.', 'locationLat': HERE['lat'], 'locationLng': HERE['lng'],
          'locationAddress': 'Roof, Brambleside Retail Park', 'assignedToId': uid[T], 'assigneeIds': [uid[T], uid[P], uid[C]]})
job = data((s, b))['id']
for to in ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']:
    call('PATCH', f'/tasks/{job}/status', tok[T], {'status': to, **HERE})
call('POST', f'/tasks/{job}/crew/join', tok[P], {'viaLeaderStart': True})
call('POST', f'/tasks/{job}/crew/issue', tok[P], {'reason': 'Waiting for the flange kit from the van'})
print(job)
