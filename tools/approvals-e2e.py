#!/usr/bin/env python3
"""
Approvals inbox — end-to-end over real HTTP against the LOCAL demo org.

  python3 tools/approvals-e2e.py            (gateway on localhost:4000, seed-demo data)

⚠️ LOCAL ONLY. It creates and ends a stand-in, and approves/refuses nothing it
does not put back: every decision it tries is either refused by design or
undone (the stand-in is ended at the end, also on failure).

Covers:
  A. the inbox: only what the caller may decide, each item says why
  B. who else can decide: answered only for the caller's own items
  C. a stand-in (delegation): the deputy gains the leader's approval decisions
     in the leader's workspaces only, says "covering for", never about the
     leader themselves, cannot hand it on, and loses it when it ends
  D. an office rule: past a threshold the first approval is step 1 of 2 —
     nothing is written, the same person and somebody without the role are
     refused, removing the rule closes the half-done step (the leave request
     stays exactly as it was)
"""
import subprocess
import atexit
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = 'http://localhost:4000/api/v1'
PASSWORD = 'password123'
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


_tokens = {}
# Every sign-in is a SESSION on that account, and an account keeps only its newest
# five (MAX_SESSIONS_PER_USER): runs that never sign out push the person's real
# phone and browser sessions out. So every session this run opens is closed at exit.
_sessions = []


def _sign_out_all():
    for access, refresh in _sessions:
        call('POST', '/auth/logout', access, {'refreshToken': refresh})


atexit.register(_sign_out_all)


def login(name):
    """One sign-in per person per run; the sign-in route is rate-limited, so wait it out."""
    if name in _tokens:
        return _tokens[name]
    for _ in range(8):
        status, body = call('POST', '/auth/login', None, {'email': f'{name}@example.com', 'password': PASSWORD})
        tok = data(body).get('accessToken') if isinstance(data(body), dict) else None
        if tok and data(body).get('refreshToken'):
            _sessions.append((tok, data(body)['refreshToken']))
        if tok:
            _tokens[name] = tok
            return tok
        time.sleep(15)
    sys.exit(f'cannot sign in as {name}: {status} {body}')


def me(token):
    return data(call('GET', '/auth/me', token)[1])


def inbox(token):
    status, body = call('GET', '/approvals', token)
    assert status == 200, (status, body)
    return data(body)['items']


def main():
    leader_tok = login('mike')
    leader = me(leader_tok)
    print('\n— A. the inbox')
    items = inbox(leader_tok)
    check('the leader has items', len(items) > 0, len(items))
    check('every item says why', all(i.get('why', {}).get('via') for i in items))
    check('never their own', all(i['subject'].get('id') != leader['id'] for i in items))
    spaces = {i['space']['id']: i['space']['name'] for i in items if i['kind'] == 'hours' and i.get('space')}
    check('the leader approves hours somewhere', bool(spaces), spaces)

    print('\n— B. who else can decide')
    first = items[0]
    status, body = call('GET', f"/approvals/route?kind={first['kind']}&id={first['id']}", leader_tok)
    check('answered for an item of their own inbox', status == 200 and 'deciders' in data(body), status)
    status, _ = call('GET', '/approvals/route?kind=hours&id=not-theirs', leader_tok)
    check('404 for anything else', status == 404, status)
    status, _ = call('GET', '/approvals/route?kind=billing&id=x', leader_tok)
    check('an unknown kind is refused', status == 400, status)

    print('\n— C. a stand-in')
    status, body = call('GET', '/approvals/stand-ins', leader_tok)
    view = data(body)
    check('the leader may hand over', status == 200 and view.get('mayHandOver') is True, view.get('mayHandOver'))
    candidates = view.get('candidates', [])
    deputy_name = None
    deputy_tok = None
    for name in ('dana', 'david', 'noor', 'karim'):
        tok = login(name)
        info = me(tok)
        if any(c['id'] == info['id'] for c in candidates) and not any(i['kind'] == 'hours' for i in inbox(tok)):
            deputy_name, deputy_tok, deputy = name, tok, info
            break
    check('found a colleague who cannot approve hours', deputy_tok is not None, [c['name'] for c in candidates][:8])
    if not deputy_tok:
        return

    today = date.today()
    # Somebody with no approval decision of their own has nothing to hand over.
    status, body = call('GET', '/approvals/stand-ins', deputy_tok)
    if data(body).get('mayHandOver') is False:
        status, body = call('POST', '/approvals/stand-ins', deputy_tok, {
            'toUserId': leader['id'], 'startsOn': today.isoformat(), 'endsOn': today.isoformat(),
        })
        check('somebody without approvals has nothing to hand over', status == 400 and body.get('code') == 'STAND_IN_NOTHING_TO_HAND_OVER', (status, body.get('code')))
    else:
        print(f'SKIP nothing-to-hand-over ({deputy_name} decides something themselves)')
    status, body = call('POST', '/approvals/stand-ins', leader_tok, {
        'toUserId': leader['id'], 'startsOn': today.isoformat(), 'endsOn': today.isoformat(),
    })
    check('not to yourself', status == 400 and body.get('code') == 'STAND_IN_SELF', (status, body.get('code')))
    status, body = call('POST', '/approvals/stand-ins', leader_tok, {
        'toUserId': deputy['id'], 'startsOn': today.isoformat(), 'endsOn': (today + timedelta(days=90)).isoformat(),
    })
    check('not longer than the limit', status == 400 and body.get('code') == 'STAND_IN_TOO_LONG', (status, body.get('code')))

    status, body = call('POST', '/approvals/stand-ins', leader_tok, {
        'toUserId': deputy['id'], 'startsOn': today.isoformat(), 'endsOn': (today + timedelta(days=2)).isoformat(),
        'note': 'e2e — away for a test',
    })
    stand_in = data(body)
    check('the leader hands over today', status in (200, 201) and stand_in.get('active') is True, (status, body))
    if status not in (200, 201):
        return
    try:
        status, body = call('POST', '/approvals/stand-ins', leader_tok, {
            'toUserId': deputy['id'], 'startsOn': today.isoformat(), 'endsOn': today.isoformat(),
        })
        check('no second stand-in for the same days', status == 400 and body.get('code') == 'STAND_IN_OVERLAP', (status, body.get('code')))

        covered = inbox(deputy_tok)
        hours = [i for i in covered if i['kind'] == 'hours']
        check('the deputy now sees the leader\'s hours', len(hours) > 0, len(hours))
        check('only in the leader\'s workspaces', all(i['space']['id'] in spaces for i in hours), {i['space']['name'] for i in hours})
        check('each says whose decisions they cover', all(i['why']['via'] == 'DELEGATED' and i['why'].get('fromName') for i in hours), hours[:1] and hours[0]['why'])
        check('never about the leader they cover', all(i['subject'].get('id') != leader['id'] for i in covered))
        status, _ = call('GET', '/attendance/approvals/pending?limit=1', deputy_tok)
        check('the hours list itself opens for them (the kind\'s own guard)', status == 200, status)

        # The kind's own refusal for the leader's own item, as the deputy.
        status, ldr = call('GET', '/approvals', login('client'))
        # Inside the leader's workspaces, so the refusal is the stand-in rule, not the workspace scope.
        leaders_own = [i for i in data(ldr)['items'] if i['kind'] == 'hours' and i['subject'].get('id') == leader['id'] and (i.get('space') or {}).get('id') in spaces]
        if leaders_own:
            item = leaders_own[0]
            status, body = call('POST', '/approvals/decide', deputy_tok, {'kind': 'hours', 'id': item['id'], 'action': 'reject', 'reason': 'e2e must be refused'})
            check('deciding about the leader is refused', status == 403 and body.get('code') == 'STAND_IN_FOR_SUBJECT', (status, body.get('code')))
        else:
            print('SKIP deciding about the leader (the leader has no pending hours of their own)')

        status, body = call('GET', f"/approvals/route?kind=hours&id={hours[0]['id']}", leader_tok) if hours and any(h['id'] == hours[0]['id'] for h in inbox(leader_tok)) else (None, None)
        if status == 200:
            check('who-else lists the deputy as covering', any(d['id'] == deputy['id'] and d['via'] == 'DELEGATED' for d in data(body)['deciders']), data(body)['deciders'][:4])

        status, body = call('GET', '/approvals/stand-ins', deputy_tok)
        check('the deputy sees it as received', any(s['id'] == stand_in['id'] for s in data(body).get('received', [])))
    finally:
        status, _ = call('POST', f"/approvals/stand-ins/{stand_in['id']}/end", deputy_tok)
        check('the deputy may end it', status == 200, status)

    left = [i for i in inbox(deputy_tok) if i['kind'] == 'hours']
    check('once ended, the leader\'s hours are gone from the deputy at once', len(left) == 0, len(left))
    status, _ = call('POST', f"/approvals/stand-ins/{stand_in['id']}/end", leader_tok)
    check('ending it twice is 404', status == 404, status)


def rules_section():
    print('\n— D. an office rule')
    admin = login('client')
    leader_tok = login('mike')
    status, _ = call('GET', '/approvals/rules', leader_tok)
    check('only people managers read the rules', status == 403, status)

    status, body = call('GET', '/approvals/rules/roles', admin)
    roles = data(body) if status == 200 else []
    # A rule may only ask a role whose holders can approve requests (RULE_ROLE_CANNOT_DECIDE otherwise). The Admin
    # role: its holder finishes at once, and nobody else in the scenario holds it — the second step can be refused.
    able = [r for r in roles if 'request' in (r.get('decides') or [])]
    role = next((r for r in able if r.get('name') == 'Admin'), None) or (able[0] if able else None)
    check('found a role for the second step', role is not None, status)
    if not role:
        return
    requests = [i for i in inbox(leader_tok) if i['kind'] == 'request']
    if not requests:
        print('SKIP office rule (the leader has no pending requests)')
        return
    item = requests[0]
    status, body = call('POST', '/approvals/rules', admin, {'kind': 'request', 'secondRoleId': role['id']})
    rule_id = data(body).get('id') if status in (200, 201) else None
    check('the office adds a rule: every request needs a second approval', bool(rule_id), (status, body))
    if not rule_id:
        return
    try:
        status, body = call('POST', '/approvals/decide', leader_tok, {'kind': 'request', 'id': item['id'], 'action': 'approve'})
        check('the first approval is step 1 of 2', status == 200 and data(body).get('stage') == 'FIRST_STEP', (status, body))
        again = next((i for i in inbox(leader_tok) if i['kind'] == 'request' and i['id'] == item['id']), None)
        check('nothing was decided: it is still waiting', again is not None)
        check('it says who went first and whom it needs', bool(again and again.get('step', {}).get('mine') is True and again['step'].get('roleName')), again and again.get('step'))
        status, body = call('POST', '/approvals/decide', leader_tok, {'kind': 'request', 'id': item['id'], 'action': 'approve'})
        check('the same person cannot give the second', status == 409 and body.get('code') == 'SECOND_STEP_SAME_PERSON', (status, body.get('code')))
        for name in ('hassan', 'lisa'):
            tok = login(name)
            if any(i['kind'] == 'request' and i['id'] == item['id'] for i in inbox(tok)):
                status, body = call('POST', '/approvals/decide', tok, {'kind': 'request', 'id': item['id'], 'action': 'approve'})
                check(f'{name} (no {role["name"]}) cannot give the second', status == 403 and body.get('code') == 'SECOND_STEP_REQUIRED', (status, body.get('code')))
                break
        else:
            print('SKIP second-step refusal (nobody else in the demo decides this request)')
    finally:
        status, _ = call('DELETE', f'/approvals/rules/{rule_id}', admin)
        check('the rule is removed', status == 200, status)
    still = next((i for i in inbox(leader_tok) if i['kind'] == 'request' and i['id'] == item['id']), None)
    check('the request is untouched (still waiting)', still is not None)
    # Removing a rule never wipes approvals already given: the step stays only while ANOTHER active rule still asks
    # the same role (decision 2026-10-27). Whether it shows depends on the organization's own rules.
    other = [r for r in data(call('GET', '/approvals/rules', admin)[1]) or []
             if r.get('kind') == 'request' and r.get('isActive') and r.get('secondRoleId') == role['id'] and not r.get('spaceId')]
    shown = bool(still and still.get('step'))
    check('half-way only if another rule still asks for that role', shown == bool(other), (shown, len(other)))
    # Leave no step of this run behind.
    subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-qc',
                    f"update approval_steps set \"consumedAt\" = now() where \"itemId\" = '{item['id']}' and \"consumedAt\" is null"],
                   check=False, capture_output=True)


if __name__ == '__main__':
    main()
    rules_section()
    print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)
