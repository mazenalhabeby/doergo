#!/usr/bin/env python3
"""
A deep pass over clock-in / clock-out, against the RUNNING stack.

    python3 tools/clock-audit.py        (services up, seed-shift-test.ts run)

Not a replacement for the unit suites — those prove the rules. This proves the
system: real HTTP, real tokens, real rows, in the order a person walks them. It
exists because three of the defects found while building this feature were only
visible end to end (a stale payload, a heartbeat opening an excursion on an away
day, a picker skipped because exactly one workspace qualified).

Every check states what it is protecting, so a failure says what broke rather
than which line number disagreed. Nothing here trusts the client: each assertion
is about what the SERVER did, read back from the API or the database.
"""
import json, subprocess, sys, time, urllib.request, urllib.error

API = "http://localhost:4000/api/v1"
ORG = "cmoyg9pzs0000sbtcdb6r9de7"
VIENNA = {"lat": 48.2082, "lng": 16.3738, "accuracy": 15}

results = []
def check(group, name, ok, detail=""):
    results.append((group, name, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail and not ok else ""))

def sql(q):
    out = subprocess.run(
        ["docker","exec","hbcfield-postgres","psql","-U","hbcfield","-d","hbcfield","-t","-A","-F","|","-c",q],
        capture_output=True, text=True)
    return [l for l in out.stdout.strip().split("\n") if l]

_last = [0.0]

def call(method, path, token=None, body=None, _tries=10):
    """
    One request, respecting the throttle.

    The API allows 3/sec and 20/10sec. A harness that fires as fast as it can
    gets 429s and then reads every downstream 401 as a product failure — which
    is exactly what the first run of this file did. Backing off is the harness
    behaving like a client, not a workaround.
    """
    for attempt in range(_tries):
        # 3 requests a second is the limit; stay under it rather than discover
        # it. The 100/minute budget is the one that actually bites a long run.
        gap = time.time() - _last[0]
        if gap < 0.7:
            time.sleep(0.7 - gap)
        _last[0] = time.time()
        status, payload = _once(method, path, token, body)
        if status != 429:
            return status, payload
        time.sleep(min(20.0, 4.0 * (attempt + 1)))
    return 429, {"error": "throttled"}


def _once(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}

def login(email):
    s, d = call("POST", "/auth/login", body={"email": email, "password": "password123"})
    tok = (d.get("data") or {}).get("accessToken")
    if not tok:
        print(f"  !! could not sign in as {email} (http {s}) — every later check would read as a failure")
        sys.exit(2)
    return tok

def space(name):
    r = sql(f"SELECT id FROM company_locations WHERE name='{name}' AND \"organizationId\"='{ORG}' LIMIT 1")
    return r[0] if r else None

def clock_out(tok):
    call("POST", "/attendance/clock-out", tok, {})

# Signed in one at a time, with a breath between: six logins in a burst is
# itself over the limit, and the point of this file is to test the clock, not
# the throttle.
TOK = {}
for _e in ["client@example.com","manager@example.com","mike@example.com",
           "lisa@example.com","dana@example.com","noor@example.com"]:
    TOK[_e] = login(_e)
    time.sleep(1.0)
MAIN, WH, SC = space("Main Office"), space("Warehouse"), space("Service Center")
DEPOT = "space-field-depot-test"

def at(space_id):
    """
    Coordinates INSIDE a workspace's ring.

    An earlier run clocked in from Vienna everywhere and read the refusals as
    product failures — they were the geofence doing its job. On-site means
    standing on the site, so the harness stands there.
    """
    r = sql(f'SELECT lat, lng FROM company_locations WHERE id=\'{space_id}\'')
    if not r or r[0].split("|")[0] == "":
        return dict(VIENNA)  # pin-less: anywhere is on site
    lat, lng = r[0].split("|")
    return {"lat": float(lat), "lng": float(lng), "accuracy": 10}

# An administrator assigned to a STRICT site, so the ceiling can be tested
# against somebody the assignment check does not stop first.
sql(f"""INSERT INTO space_assignments (id,"organizationId","userId","spaceId","effectiveFrom","createdAt","updatedAt")
        SELECT 'audit-admin-sc','{ORG}',u.id,'{SC}',now()-interval '1 day',now(),now() FROM users u
        WHERE u.email='client@example.com'
        ON CONFLICT (id) DO NOTHING""")

# ═══════════════════════════════════════════════ A. SECURITY
print("\nA · SECURITY — what a member must not be able to do")

s, _ = call("POST", "/attendance/clock-in", None, {"locationId": MAIN, **VIENNA})
check("sec", "clock-in without a token is refused", s == 401, f"got {s}")

# Identity comes from the token, never the body.
clock_out(TOK["mike@example.com"])
s, d = call("POST", "/attendance/clock-in", TOK["mike@example.com"],
            {"locationId": MAIN, "userId": "emp-lisa", **at(MAIN)})
entry = (d.get("data") or {})
check("sec", "a clock-in cannot be filed against another member",
      s != 200 or entry.get("userId") == "emp-mike", f"userId={entry.get('userId')}")

# Server-authoritative figures: a client may not dictate its own hours.
clock_out(TOK["mike@example.com"])
s, d = call("POST", "/attendance/clock-in", TOK["mike@example.com"],
            {"locationId": MAIN, **at(MAIN),
             "paidMinutes": 99999, "countedStartAt": "2020-01-01T00:00:00Z",
             "isRemote": False, "approvalStatus": "APPROVED", "flagReasons": []})
msg = json.dumps(d.get("message", ""))
check("sec", "a client cannot even SEND paid minutes or an approval status",
      s == 400 and "paidMinutes" in msg and "approvalStatus" in msg,
      f"http={s} {msg[:120]}")
# Stronger than ignoring them: the DTO whitelist refuses the request, so a
# client that tries is told, rather than believing it succeeded.

# Permission on the workspace ceiling.
s, _ = call("PATCH", f"/locations/{WH}", TOK["mike@example.com"], {"geofencePolicy": "NONE"})
check("sec", "a member cannot change a workspace's clock-in policy", s in (401,402,403), f"got {s}")

# And an unknown value is refused rather than silently ignored.
s, _ = call("PATCH", f"/locations/{WH}", TOK["client@example.com"], {"geofencePolicy": "OFF"})
check("sec", "an unrecognised policy is refused, not stored", s == 400, f"got {s}")
pol = sql(f"SELECT \"geofencePolicy\" FROM company_locations WHERE id='{WH}'")[0]
check("sec", "…and the workspace kept its real policy", pol == "AWAY_ALLOWED", pol)

# The ceiling cannot be climbed by anybody, including an admin.
clock_out(TOK["client@example.com"])
s, d = call("POST", "/attendance/clock-in", TOK["client@example.com"], {"locationId": SC, **VIENNA})
check("sec", "a strict site refuses even an ADMIN from off site",
      s >= 400 and "on site" in (d.get("message") or ""), f"{s} {d.get('message')}")

# The grant cannot be self-issued.
s, _ = call("PATCH", "/employees/emp-mike", TOK["mike@example.com"], {"allowRemote": True})
still = sql("SELECT \"allowRemote\" FROM users WHERE email='mike@example.com'")[0]
check("sec", "a member cannot grant themselves away-clock-in", still == "f", f"http={s} allowRemote={still}")

# Break rules are configuration.
s, _ = call("POST", "/attendance/break-rules", TOK["mike@example.com"],
            {"spaceId": MAIN, "name": "hax", "trigger": "AFTER_WORKED", "afterMinutes": 1, "durationMinutes": 5})
check("sec", "a member cannot create rest rules", s in (401,402,403), f"got {s}")

# Cross-tenant.
other = sql("SELECT id FROM company_locations WHERE \"organizationId\" <> '%s' AND \"isActive\"=true LIMIT 1" % ORG)
if other:
    s, _ = call("POST", "/attendance/clock-in", TOK["mike@example.com"], {"locationId": other[0], **VIENNA})
    check("sec", "cannot clock in at another organization's workspace", s >= 400, f"got {s}")

# Input bounds.
clock_out(TOK["lisa@example.com"])
s, _ = call("POST", "/attendance/clock-in", TOK["lisa@example.com"],
            {"locationId": WH, **VIENNA, "awayReason": "x" * 5000})
check("sec", "an oversized away reason is refused", s == 400, f"got {s}")

# Overtime approval bounds + self-approval.
clock_out(TOK["lisa@example.com"])
call("POST", "/attendance/clock-in", TOK["lisa@example.com"], {"locationId": WH, **VIENNA})
eid = sql("SELECT id FROM time_entries WHERE \"userId\"='emp-lisa' AND status='CLOCKED_IN'")
if eid:
    s, _ = call("POST", f"/attendance/extra-time/{eid[0]}/approve", TOK["lisa@example.com"], {"minutes": 60})
    check("sec", "a member cannot approve their own overtime", s >= 400, f"got {s}")
    s, _ = call("POST", f"/attendance/extra-time/{eid[0]}/approve", TOK["manager@example.com"], {"minutes": 99999})
    check("sec", "an absurd overtime amount is refused", s == 400, f"got {s}")
    s, _ = call("POST", f"/attendance/extra-time/{eid[0]}/approve", TOK["manager@example.com"],
                {"minutes": 30, "signature": "<script>alert(1)</script>"})
    check("sec", "a signature that is not a PNG data URL is refused", s == 400, f"got {s}")

# One member's rest actions cannot touch another's shift.
before = sql("SELECT \"breakPlan\" FROM time_entries WHERE \"userId\"='emp-dana' AND status='CLOCKED_IN'")
call("POST", "/attendance/breaks/snooze", TOK["mike@example.com"], {"ruleId": "whatever"})
after = sql("SELECT \"breakPlan\" FROM time_entries WHERE \"userId\"='emp-dana' AND status='CLOCKED_IN'")
check("sec", "postponing a rest touches only the caller's own shift", before == after)

print("\nB · BEHAVIOUR — the journeys a member actually walks")

# The away matrix, end to end.
cases = [
    ("granted at a permitting site", "lisa@example.com", WH, True),
    ("granted, but the site is strict", "lisa@example.com", SC, False),
    ("granted, refused on THIS assignment", "lisa@example.com", DEPOT, False),
    ("permitting site, no grant", "mike@example.com", WH, False),
]
for label, who, sp, expect_ok in cases:
    clock_out(TOK[who])
    s, d = call("POST", "/attendance/clock-in", TOK[who], {"locationId": sp, **VIENNA, "awayReason": "Client visit"})
    ok = (s == 200 or s == 201)
    check("away", label, ok == expect_ok, f"http={s} {d.get('message','')[:70]}")

# The away day keeps everything.
clock_out(TOK["lisa@example.com"])
call("POST", "/attendance/clock-in", TOK["lisa@example.com"], {"locationId": WH, **VIENNA, "awayReason": "Visiting BILLA AG"})
r = sql("""SELECT l.name, t."isRemote", t."awayReason", t."shiftId" IS NOT NULL,
                  t."expectedClockOutAt" IS NOT NULL, t."approvalStatus", t."flagReasons"
           FROM time_entries t JOIN company_locations l ON l.id=t."locationId"
           WHERE t."userId"='emp-lisa' AND t.status='CLOCKED_IN'""")
if r:
    name, remote, reason, shift, expect, appr, flags = r[0].split("|")
    check("away", "the day is filed against the real workspace, not a bucket", name == "Warehouse", name)
    check("away", "it is marked away and keeps the reason", remote == "t" and reason == "Visiting BILLA AG")
    check("away", "it keeps its shift and its expected end", shift == "t" and expect == "t")
    check("away", "it is held for review rather than auto-approved", appr == "PENDING", appr)
    check("away", "it is flagged as outside the ring", "OUTSIDE_GEOFENCE_IN" in flags, flags)

# An away day is not an excursion.
call("POST", "/attendance/heartbeat", TOK["lisa@example.com"], VIENNA)
ex = sql("""SELECT count(*) FROM geofence_excursions e JOIN time_entries t ON t.id=e."timeEntryId"
            WHERE t."userId"='emp-lisa' AND t.status='CLOCKED_IN'""")
check("away", "a heartbeat from 200km away opens no excursion", ex and ex[0] == "0", f"excursions={ex}")

# Counted time.
clock_out(TOK["noor@example.com"])
call("POST", "/attendance/clock-in", TOK["noor@example.com"], {"locationId": MAIN, **at(MAIN)})
s, d = call("POST", "/attendance/clock-out", TOK["noor@example.com"], {**at(MAIN), "earlyReason": "Testing"})
data = d.get("data") or {}
check("counted", "clock-out reports the shortfall against the shift", (data.get("shortfallMinutes") or 0) > 0,
      f"shortfall={data.get('shortfallMinutes')}")
check("counted", "the message quotes COUNTED hours, not time present",
      "counted" in (d.get("message") or "").lower(), d.get("message"))
row = sql("""SELECT "countedStartAt" IS NOT NULL, "paidMinutes" IS NOT NULL, notes
             FROM time_entries WHERE "userId"='emp-noor' ORDER BY "clockInAt" DESC LIMIT 1""")
if row:
    cs, pm, notes = row[0].split("|")
    check("counted", "the counted window and paid minutes are stored", cs == "t" and pm == "t")
    check("counted", "the reason is recorded with the entry", "Testing" in (notes or ""), notes)

# Rests.
clock_out(TOK["dana@example.com"])
call("POST", "/attendance/clock-in", TOK["dana@example.com"], {"locationId": MAIN, **at(MAIN)})
plan = sql("SELECT jsonb_array_length(\"breakPlan\") FROM time_entries WHERE \"userId\"='emp-dana' AND status='CLOCKED_IN'")
check("rest", "clock-in freezes a rest plan onto the shift", plan and plan[0] not in ("", "0"), f"items={plan}")
s, d = call("POST", "/attendance/breaks/snooze", TOK["dana@example.com"], {})
sn = (d.get("data") or {})
check("rest", "postponing counts on the SERVER", sn.get("snoozeCount") == 1, str(sn))
s, d = call("POST", "/attendance/breaks/start", TOK["dana@example.com"], {})
br = (d.get("data") or {})
check("rest", "starting a rest links it to the planned one", bool(br.get("ruleId")), str(br)[:90])
st = sql("SELECT \"breakPlan\"->0->>'state' FROM time_entries WHERE \"userId\"='emp-dana' AND status='CLOCKED_IN'")
check("rest", "the plan records it as taken", st and st[0] == "TAKEN", str(st))
s, _ = call("POST", "/attendance/breaks/start", TOK["dana@example.com"], {})
check("rest", "a second rest cannot run while one is open", s >= 400, f"got {s}")
call("POST", "/attendance/breaks/end", TOK["dana@example.com"], {})

# Overtime rounds.
clock_out(TOK["lisa@example.com"])
call("POST", "/attendance/clock-in", TOK["lisa@example.com"], {"locationId": WH, **VIENNA})
_e = sql("SELECT id FROM time_entries WHERE \"userId\"='emp-lisa' AND status='CLOCKED_IN'")
eid = _e[0] if _e else ""
call("POST", f"/attendance/entries/{eid}/request-extra-time", TOK["lisa@example.com"], {})
call("POST", f"/attendance/extra-time/{eid}/approve", TOK["manager@example.com"],
     {"minutes": 30, "signature": "data:image/png;base64,iVBORw0KGgo="})
call("POST", f"/attendance/entries/{eid}/request-extra-time", TOK["lisa@example.com"], {})
rounds = sql(f"SELECT cycle, status, \"leaderSignature\" IS NOT NULL FROM overtime_requests WHERE \"timeEntryId\"='{eid}' ORDER BY cycle")
check("overtime", "each round is recorded separately", len(rounds) >= 2, str(rounds))
check("overtime", "the first round holds its approval and signature",
      bool(rounds) and rounds[0].split("|")[1] == "APPROVED" and rounds[0].split("|")[2] == "t", str(rounds[:1]))

# The offered list equals the rule.
for who in ["lisa@example.com", "mike@example.com"]:
    _, d = call("GET", "/attendance/clock-in-locations", TOK[who])
    offered = {l["name"]: l.get("awayAllowed") for l in (d.get("data") or [])}
    for name, sid in [("Warehouse", WH), ("Service Center", SC)]:
        if name not in offered: continue
        clock_out(TOK[who])
        s, _ = call("POST", "/attendance/clock-in", TOK[who], {"locationId": sid, **VIENNA})
        accepted = s in (200, 201)
        check("list", f"{who.split('@')[0]} @ {name}: the list matches the clock-in",
              offered[name] == accepted, f"offered={offered[name]} accepted={accepted}")

for t in TOK.values(): clock_out(t)

print("\n" + "=" * 64)
fails = [r for r in results if not r[2]]
print(f"{len(results) - len(fails)}/{len(results)} passed")
if fails:
    print("\nFAILED:")
    for g, n, _, d in fails: print(f"  [{g}] {n} — {d}")
sys.exit(1 if fails else 0)
