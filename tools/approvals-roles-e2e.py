#!/usr/bin/env python3
"""
The approvals inbox, end to end, AS EACH ROLE — over real HTTP, with timings.
LOCAL ONLY (the seed-demo organization + `tools/external-ui-seed.py`).

  python3 tools/external-ui-seed.py        # once: the client site + external Klaus
  python3 tools/approvals-roles-e2e.py

Roles: owner/admin (John), manager (Anna), workspace leader (Mike), a member
with no decisions (a NEW member who joins by invitation here, removed at the
end — the demo's people all hold extra grants from earlier testing), a member
asking (Noor), an EXTERNAL supervisor
(Klaus, given the role here through the permission builder like an admin would).

What it changes (local data, on purpose, in 2027 so it never meets a real day):
Noor asks for leave three times — one is refused with a reason, one approved,
one approved through an office rule's two steps; the rule is removed after.
Klaus approves one of the two shifts the seed left for him.
"""
import atexit
import json
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = 'http://localhost:4000/api/v1'
PASSWORD = 'password123'
WEINGAERTNER, OTHER_SITE = 'ui-ext-weingaertner', 'ui-ext-other'
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
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            status, out = r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            status, out = e.code, (json.loads(raw) if raw else {})
        except ValueError:
            status, out = e.code, {}
    if label:
        timings.setdefault(label, []).append((time.perf_counter() - t0) * 1000)
    return status, out


def data(b):
    return b.get('data', b) if isinstance(b, dict) else b


def check(label, ok, detail=None):
    global failures
    print(('PASS ' if ok else 'FAIL ') + label + ('' if ok or detail is None else f'  → {detail}'))
    if not ok:
        failures += 1


_tokens = {}
# Every sign-in is a SESSION on that account, and an account keeps only its newest
# five (MAX_SESSIONS_PER_USER): runs that never sign out push the person's real
# phone and browser sessions out. So every session this run opens is closed at exit.
_sessions = []


def _sign_out_all():
    for access, refresh in _sessions:
        call('POST', '/auth/logout', access, {'refreshToken': refresh})


atexit.register(_sign_out_all)

# Every run asks for days nobody asked for before (the overlap rule would rightly refuse a repeat).
import random
_BASE = date(2027, 1, 4) + timedelta(weeks=random.randint(0, 400))


def _reopen_shift(entry_id):
    """Put a shift this run approved back to waiting, so the next run has one to approve.

    The seed holds one waiting Weingärtner shift; section C approves it through the inbox, and there
    is no route that un-approves a shift — so it is reset in the database, as other e2e scripts do.
    """
    sql = ('update time_entries set "approvalStatus"=\'PENDING\', "approvedAt"=null, "approvedById"=null '
           f"where id='{entry_id}';")
    subprocess.run(['docker', 'exec', '-i', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-q'],
                   input=sql, capture_output=True, text=True)


def day(offset):
    return (_BASE + timedelta(days=offset)).isoformat()



def login(email, password=PASSWORD):
    if email in _tokens:
        return _tokens[email]
    for _ in range(10):
        s, b = call('POST', '/auth/login', None, {'email': email, 'password': password})
        tok = data(b).get('accessToken') if isinstance(data(b), dict) else None
        if tok and data(b).get('refreshToken'):
            _sessions.append((tok, data(b)['refreshToken']))
        if tok:
            _tokens[email] = tok
            return tok
        time.sleep(15)
    sys.exit(f'cannot sign in as {email}')


PLAIN_PASSWORD = 'E2e-Plain-Member-2027!'


def join_plain_member(owner_tok):
    """A brand-new member, the way people join: an invitation, accepted."""
    s, b = call('POST', '/invitations', owner_tok, {'targetRole': 'EMPLOYEE'})
    code = data(b).get('code')
    if not code:
        sys.exit(f'cannot invite: {s} {b}')
    email = f'e2e.plain.{int(time.time())}@example.com'
    s, b = call('POST', '/invitations/accept', None, {'code': code, 'email': email, 'password': PLAIN_PASSWORD, 'firstName': 'Plain', 'lastName': 'Member'})
    if s not in (200, 201):
        sys.exit(f'cannot accept: {s} {b}')
    return email


def me(tok):
    return data(call('GET', '/auth/me', tok)[1])


def inbox(tok, label):
    s, b = call('GET', '/approvals', tok, label=label)
    assert s == 200, (label, s, b)
    return data(b)['items']


def main():
    owner = login('client@example.com')
    plain_email = join_plain_member(owner)
    who = {
        'owner': owner,
        'manager': login('manager@example.com'),
        'leader': login('mike@example.com'),
        'nobody': login(plain_email, PLAIN_PASSWORD),
        'member': login('noor@example.com'),
        'external': login('klaus.huber@weingaertner.example'),
    }
    ids = {k: me(t)['id'] for k, t in who.items()}

    print('\n— 0. the office gives Klaus (external) the External Supervisor role at Weingärtner')
    s, roster = call('GET', f'/locations/{WEINGAERTNER}/members', who['owner'])
    klaus_row = next((r for r in data(roster) if r.get('userId') == ids['external']), None)
    check('Klaus is on Weingärtner\'s roster', klaus_row is not None, s)
    if klaus_row:
        aid = klaus_row['id']
        s, perms = call('GET', f'/spaces/{WEINGAERTNER}/members/{aid}/permissions', who['owner'])
        role = next((r for r in data(perms).get('assignableRoles', []) if r.get('slug') == 'external-supervisor' or 'External Supervisor' in (r.get('name') or '')), None)
        check('the builder offers the External Supervisor role', role is not None, [r.get('name') for r in data(perms).get('assignableRoles', [])][:6])
        if role:
            s, b = call('PUT', f'/spaces/{WEINGAERTNER}/members/{aid}/permissions', who['owner'], {'roleId': role['id']})
            check('the admin gives it', s == 200, (s, b))
    # Klaus's next request carries it (the session cache is dropped by the builder).
    _tokens.pop('klaus.huber@weingaertner.example', None)
    who['external'] = login('klaus.huber@weingaertner.example')

    print('\n— A. each role\'s inbox: only what they may decide, never their own, fast')
    for role, tok in who.items():
        for _ in range(4):
            items = inbox(tok, f'inbox:{role}')
        kinds = sorted({i['kind'] for i in items})
        print(f'     {role:8} {len(items):4} items  kinds={kinds}')
        check(f'{role}: every item is decidable and says why', all(i.get('canDecide') and i.get('why', {}).get('via') for i in items))
        check(f'{role}: never their own', all(i['subject'].get('id') != ids[role] for i in items))
        s, c = call('GET', '/approvals/count', tok, label=f'count:{role}')
        check(f'{role}: the count matches the list', s == 200 and data(c)['total'] == len(items), (data(c).get('total'), len(items)))
    nobody = inbox(who['nobody'], 'inbox:nobody')
    check('a member who decides nothing has an empty inbox', nobody == [], len(nobody))
    ext = inbox(who['external'], 'inbox:external')
    check('the external sees ONLY Weingärtner', all((i.get('space') or {}).get('id') == WEINGAERTNER for i in ext), {(i.get('space') or {}).get('name') for i in ext})
    check('the external sees only time-and-attendance kinds', {i['kind'] for i in ext} <= {'hours', 'away', 'extraTime', 'overtime', 'noShow', 'issue'}, {i['kind'] for i in ext})
    check('the external has the seed\'s Weingärtner shifts to approve', any(i['kind'] == 'hours' for i in ext), len(ext))
    leader_items = inbox(who['leader'], 'inbox:leader')
    space_kinds = {'hours', 'away', 'extraTime', 'overtime', 'noShow'}
    check('the workspace leader sees no workspace\'s but their own', len({(i.get('space') or {}).get('id') for i in leader_items if i['kind'] in space_kinds}) <= 1)

    print('\n— B. who else can decide — only for your own items')
    owner_items = inbox(who['owner'], 'inbox:owner')
    if owner_items:
        it = owner_items[0]
        for _ in range(3):
            s, b = call('GET', f"/approvals/route?kind={it['kind']}&id={it['id']}", who['owner'], label='route:owner')
        check('the owner gets who else can decide', s == 200 and 'deciders' in data(b), s)
        foreign = next((i for i in owner_items if (i.get('space') or {}).get('id') not in (WEINGAERTNER,)), None)
        if foreign:
            s, _ = call('GET', f"/approvals/route?kind={foreign['kind']}&id={foreign['id']}", who['external'], label='route:external-probe')
            check('the external asking about another workspace\'s item gets 404', s == 404, s)

    print('\n— C. the external, as a user')
    s, _ = call('GET', '/approvals/rules', who['external'])
    check('cannot read the office rules', s == 403, s)
    s, v = call('GET', '/approvals/stand-ins', who['external'])
    check('is not offered to hand over a stand-in', s == 200 and data(v).get('mayHandOver') is False, data(v).get('mayHandOver'))
    s, b = call('POST', '/approvals/stand-ins', who['external'], {'toUserId': ids['leader'], 'startsOn': '2027-01-04', 'endsOn': '2027-01-05'})
    check('and refused if they try', s == 400 and b.get('code') in ('STAND_IN_EXTERNAL', 'STAND_IN_NOT_A_COLLEAGUE', 'STAND_IN_NOTHING_TO_HAND_OVER'), (s, b.get('code')))
    s, _ = call('POST', '/employees/me/requests/precheck', who['external'], {'kind': 'LEAVE', 'type': 'VACATION', 'startDate': '2027-02-01', 'endDate': '2027-02-02'})
    check('has no requests of their own (no time off)', s in (402, 403), s)
    hours = [i for i in ext if i['kind'] == 'hours']
    if hours:
        before = len(ext)
        s, b = call('POST', '/approvals/decide', who['external'], {'kind': 'hours', 'id': hours[0]['id'], 'action': 'approve'}, label='decide:external')
        check('approves a Weingärtner shift from the inbox', s == 200, (s, b))
        if s == 200:
            atexit.register(_reopen_shift, hours[0]['id'])
        check('and it leaves their inbox', len(inbox(who['external'], 'inbox:external')) == before - 1)
        other = next((i for i in owner_items if i['kind'] == 'hours' and (i.get('space') or {}).get('id') == OTHER_SITE), None)
        if other:
            s, b = call('POST', '/approvals/decide', who['external'], {'kind': 'hours', 'id': other['id'], 'action': 'approve'})
            check('cannot approve Other site\'s shift by id', s in (403, 404), (s, b.get('code')))

    print('\n— D. a member asks, the office decides (2027)')
    member = who['member']
    leave = lambda a, b, t='VACATION': {'kind': 'LEAVE', 'type': t, 'startDate': a, 'endDate': b, 'reason': 'e2e'}
    for _ in range(3):
        s, pre = call('POST', '/employees/me/requests/precheck', member, leave(day(0), day(2)), label='precheck:member')
    check('the member\'s pre-check answers', s == 200 and data(pre).get('workingDays') is not None, (s, data(pre)))
    check('cover reaches the member as a level only', 'names' not in json.dumps(data(pre)), data(pre).get('cover'))

    def ask(body):
        s, b = call('POST', f"/employees/{ids['member']}/time-off", member, body, label='request:member')
        return s, data(b)

    s, r1 = ask(leave(day(0), day(2)))
    check('Noor asks for three days', s in (200, 201) and r1.get('id'), (s, r1))
    s, pre = call('POST', '/employees/me/requests/precheck', member, leave(day(1), day(3)))
    check('asking again for overlapping days: the pre-check says so first', bool(data(pre).get('clashes')), data(pre))
    decider = None
    for role in ('manager', 'owner'):
        if any(i['kind'] == 'request' and i['id'] == r1.get('id') for i in inbox(who[role], f'inbox:{role}')):
            decider = role
            break
    check('the request reaches the office\'s inbox', decider is not None)
    if decider:
        s, b = call('POST', '/approvals/decide', who[decider], {'kind': 'request', 'id': r1['id'], 'action': 'reject'})
        check(f'{decider}: a refusal needs nothing more for leave (reason optional)', s == 200, (s, b))
        s, r2 = ask(leave(day(7), day(8)))
        check('Noor asks for two more days', s in (200, 201) and r2.get('id'), (s, r2))
        s, b = call('POST', '/approvals/decide', who[decider], {'kind': 'request', 'id': r2.get('id'), 'action': 'approve'}, label='decide:request')
        check(f'{decider} approves two days from the inbox', s == 200 and not data(b).get('stage'), (s, b))
        s, mine = call('GET', f"/employees/{ids['member']}/time-off", member)
        rows = {x['id']: x['status'] for x in data(mine)} if isinstance(data(mine), list) else {}
        check('Noor sees refused and approved', rows.get(r1['id']) == 'REJECTED' and rows.get(r2.get('id')) == 'APPROVED', rows)

    print('\n— E. an office rule: two people')
    s, members = call('GET', '/organizations/members?limit=200', who['owner'])
    rows = data(members) if isinstance(data(members), list) else data(members).get('members', []) if isinstance(data(members), dict) else []
    anna = next((m for m in rows if m.get('id') == ids['manager']), None)
    role_id = (anna or {}).get('memberRoleId') or ((anna or {}).get('memberRole') or {}).get('id')
    first = None
    for role in ('owner',):
        pass
    if not role_id:
        print('SKIP office rule (the manager holds no org role here)')
    else:
        s, b = call('POST', '/approvals/rules', who['owner'], {'kind': 'request', 'minDays': 1, 'secondRoleId': role_id})
        rule = data(b).get('id')
        check('the owner adds: leave over 1 day needs the manager\'s role too', s in (200, 201) and rule, (s, b))
        try:
            s, r3 = ask(leave(day(14), day(16)))
            s, pre = call('POST', '/employees/me/requests/precheck', member, leave(day(21), day(23)))
            check('the member is told up-front it needs a second approval', bool(data(pre).get('secondApproval')), data(pre))
            # Somebody who decides Noor's requests but does NOT hold the manager's role goes first —
            # found the way the inbox finds them: "who else can decide", then signed in as them.
            first = None
            s, route = call('GET', f"/approvals/route?kind=request&id={r3.get('id')}", who['manager'])
            emails = {m.get('id'): m.get('email') for m in rows}
            for d in data(route).get('deciders', []) if s == 200 else []:
                m = next((x for x in rows if x.get('id') == d['id']), {})
                if d['via'] in ('ORG', 'SPACE') and d['id'] != ids['manager'] and m.get('memberRoleId') != role_id and emails.get(d['id']) and not d.get('onLeave'):
                    try:
                        who['first'] = login(emails[d['id']])
                        first = 'first'
                        print(f"     first approver: {d['name']} ({d['via']})")
                        break
                    except SystemExit:
                        continue
            if not first:
                print('SKIP two-step (no non-holder decides Noor\'s requests in the demo)')
            else:
                s, b = call('POST', '/approvals/decide', who[first], {'kind': 'request', 'id': r3['id'], 'action': 'approve'})
                check(f'{first}: approval is step 1 of 2', s == 200 and data(b).get('stage') == 'FIRST_STEP', (s, b))
                s, b = call('POST', '/approvals/decide', who[first], {'kind': 'request', 'id': r3['id'], 'action': 'approve'})
                check(f'{first}: cannot give the second', s == 409, s)
                step = next((i.get('step') for i in inbox(who['manager'], 'inbox:manager') if i['id'] == r3['id']), None)
                check('the manager sees who went first', bool(step and step.get('firstByName')), step)
                s, b = call('POST', '/approvals/decide', who['manager'], {'kind': 'request', 'id': r3['id'], 'action': 'approve'})
                check('the manager gives the second — it is approved', s == 200 and not data(b).get('stage'), (s, b))
        finally:
            if rule:
                call('DELETE', f'/approvals/rules/{rule}', who['owner'])

    print('\n— F. permissions that must hold')
    for role in ('leader', 'nobody', 'external'):
        s, b = call('POST', '/approvals/rules', who[role], {'kind': 'request', 'remindAfterHours': 4})
        check(f'{role} cannot add an office rule', s == 403, s)
        if s in (200, 201) and data(b).get('id'):
            # A probe that wrongly succeeded must not leave a live rule behind (the sweep would act on it).
            call('DELETE', f"/approvals/rules/{data(b)['id']}", who['owner'])
    s, _ = call('GET', '/approvals', None)
    check('no token: 401', s == 401, s)
    s, _ = call('POST', '/approvals/decide', who['nobody'], {'kind': 'request', 'id': 'anything', 'action': 'approve'})
    check('somebody who decides nothing is refused at the kind\'s own route', s in (403, 404), s)
    s, b = call('DELETE', f"/organizations/members/{ids['nobody']}", who['owner'])
    check('the new member is removed again', s in (200, 204), (s, b))


def report():
    print('\n— performance (ms)')
    print(f"     {'call':28} {'n':>3} {'p50':>7} {'max':>7}")
    for label, xs in sorted(timings.items()):
        print(f'     {label:28} {len(xs):3} {statistics.median(xs):7.0f} {max(xs):7.0f}')


if __name__ == '__main__':
    main()
    report()
    print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)
