#!/usr/bin/env python3
"""
Layer 1, the deep half — every route that names a record, every write, the workspace boundary. LOCAL ONLY.

  python3 tools/layer1-deep-e2e.py [--update-map]

A. EVERY ROUTE WITH A RECORD ID (all methods), with REAL ids read from the database — records of a workspace none
   of the attackers belongs to (Service Center) wherever the record has a workspace. Asked by:
     other-org  the owner of another organization  → never a 2xx with content, never a change
     external   Klaus, external in Weingärtner      → see the reviewed map
     employee   Noor, a plain employee              → see the reviewed map
     leader     Mike, Space Manager of Main Office  → see the reviewed map
   Writes go with an EMPTY body: guards run before validation, so 403/404 = refused, 400 = let through to the
   body check (allowed, or decided deeper). Every answer class is written to tools/layer1-record-map.txt; a change
   fails until a person reviews it (--update-map).
B. EVERY WRITE WITHOUT A RECORD ID (POST/PUT/PATCH/DELETE), empty body, the same four people → the same map.
C. THE DATABASE: a fingerprint of every table (count + newest update) before and after each person's sweep —
   any change made by an attacker fails.
D. THE WORKSPACE BOUNDARY: Mike leads Main Office only; the lists he reads must not carry Service Center's jobs,
   clients, hours, people or rules.
"""
import json, os, re, subprocess, sys, urllib.error, urllib.request

B = os.environ.get('API', 'http://localhost:4000/api/v1')
if not re.match(r'^http://(localhost|127\.0\.0\.1)(:\d+)?/', B):
    sys.exit('local only')
HERE = os.path.dirname(os.path.abspath(__file__))
MAP_FILE = os.path.join(HERE, 'layer1-record-map.txt')
UPDATE = '--update-map' in sys.argv
FAILED = []
SC = 'space-service'  # the workspace none of the four belongs to


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  → {str(detail)[:600]}' if not ok and detail != '' else ''))
    if not ok:
        FAILED.append(name)


def sql(q):
    r = subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-Atc', q],
                       capture_output=True, text=True)
    return r.stdout.strip()


def one(q):
    v = sql(q).split('\n')[0].strip()
    return v or None


def unthrottle():
    subprocess.run(['docker', 'exec', 'hbcfield-redis', 'sh', '-c',
                    "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del"], capture_output=True)


def call(method, path, token=None, body=None):
    h = {'content-type': 'application/json'}
    if token:
        h['authorization'] = 'Bearer ' + token
    req = urllib.request.Request(B + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        r = urllib.request.urlopen(req, timeout=40)
        return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception:
        return 0, b''


def data(raw):
    try:
        b = json.loads(raw or b'null')
    except ValueError:
        return '<non-json>'
    return b.get('data', b) if isinstance(b, dict) else b


def klass(status, raw):
    if 200 <= status < 300:
        d = data(raw)
        empty = d in (None, [], {}, '') or (isinstance(d, dict) and d.get('items') == [])
        return '2xx-empty' if empty else '2xx'
    if status in (400, 401, 402, 403, 404, 409, 422):
        return str(status)
    return 'none' if status == 0 else f'{status // 100}xx'


def login(email, password='password123'):
    unthrottle()
    s, raw = call('POST', '/auth/login', body={'email': email, 'password': password})
    assert s in (200, 201), f'login {email}: {s}'
    d = data(raw)
    return d['accessToken'], d['user']['id']


ORG = one("select \"organizationId\" from users where email='client@example.com'")
OWNER, OWNER_ID = login('client@example.com')
PEOPLE = {
    'other-org': login('e2e-solo-owner@example.test', 'E2eSolo2026'),
    'external': login('klaus.huber@weingaertner.example'),
    'employee': login('noor@example.com'),
    'leader': login('mike@example.com'),
}
SUBJECTS = "'" + "','".join([v[1] for v in PEOPLE.values()] + [OWNER_ID]) + "'"
ATTACKERS = "'" + "','".join(v[1] for v in PEOPLE.values()) + "'"

# ── real ids: a Service Center record where the record has a workspace, else one of this organization ──────────
TASK = one(f"""select t.id from tasks t where t."spaceId"='{SC}' order by
  (select count(*) from checklist_items c where c."taskId"=t.id)+(select count(*) from attachments a where a."taskId"=t.id)
  +(select count(*) from comments m where m."taskId"=t.id) desc limit 1""")
SC_MEMBER = one(f"""select sa."userId" from space_assignments sa join users u on u.id=sa."userId"
  where sa."spaceId"='{SC}' and sa."userId" not in ({SUBJECTS}) and not u."isExternal" limit 1""")
CUSTOMER = one(f"""select id from customers where "organizationId"='{ORG}' order by ("spaceId"='{SC}') desc nulls last,
  (select count(*) from customer_activities a where a."customerId"=customers.id) desc limit 1""")
ASSET = one(f"""select a.id from assets a left join asset_categories c on c.id=a."categoryId" where a."organizationId"='{ORG}'
  order by (c."spaceId"='{SC}') desc nulls last limit 1""")
ENTRY = one(f"""select id from time_entries where "userId"='{SC_MEMBER}' order by "clockInAt" desc limit 1""") or \
    one(f"""select id from time_entries where "organizationId"='{ORG}' and "userId" not in ({SUBJECTS}) limit 1""")
INVOICE = one(f"select id from invoices where \"organizationId\"='{ORG}' limit 1")
CONV = one(f"""select c.id from conversations c where c."organizationId"='{ORG}' and not exists (select 1 from
  conversation_members m where m."conversationId"=c.id and m."userId" in ({ATTACKERS}))
  order by exists (select 1 from messages x where x."conversationId"=c.id) desc limit 1""")
REPORT = one(f"select id from service_reports where \"organizationId\"='{ORG}' limit 1")
PORTAL = one(f"select id from portals where \"organizationId\"='{ORG}' and \"spaceId\" is distinct from 'ui-ext-weingaertner' limit 1")
WORKFLOW = one(f"select id from status_workflows where \"organizationId\"='{ORG}' limit 1")

IDS = {
    ('tasks', 'id'): TASK, ('tasks', 'taskId'): TASK,
    ('checklist', 'itemId'): one(f"select c.id from checklist_items c join tasks t on t.id=c.\"taskId\" where t.\"organizationId\"='{ORG}' order by (t.\"spaceId\"='{SC}') desc limit 1"),
    ('tasks-attachments', 'attachmentId'): one(f"select a.id from attachments a join tasks t on t.id=a.\"taskId\" where t.\"organizationId\"='{ORG}' order by (t.\"spaceId\"='{SC}') desc limit 1"),
    ('reports-attachments', 'attachmentId'): one(f"select a.id from report_attachments a join service_reports r on r.id=a.\"reportId\" where r.\"organizationId\"='{ORG}' limit 1"),
    ('attendance-attachments', 'attachmentId'): one(f"select id from time_entry_note_attachments where \"organizationId\"='{ORG}' limit 1"),
    ('assignees', 'userId'): one(f"select a.\"userId\" from task_assignees a where a.\"taskId\"='{TASK}' limit 1") or SC_MEMBER,
    ('dependencies', 'depId'): one(f"select d.id from task_dependencies d join tasks t on t.id=d.\"predecessorId\" where t.\"organizationId\"='{ORG}' limit 1"),
    ('assets', 'id'): ASSET, ('assets', 'assetId'): ASSET,
    ('log', 'entryId'): one(f"select id from asset_activities where \"assetId\"='{ASSET}' limit 1"),
    ('money', 'entryId'): one(f"select id from asset_money where \"organizationId\"='{ORG}' limit 1"),
    ('expenses', 'entryId'): one(f"select id from asset_money where \"organizationId\"='{ORG}' limit 1"),
    ('rows', 'rowId'): one(f"select id from asset_list_rows where \"organizationId\"='{ORG}' limit 1"),
    ('proposals', 'id'): one(f"select id from asset_proposals where \"organizationId\"='{ORG}' limit 1"),
    ('member', 'memberId'): SC_MEMBER,
    ('customers', 'id'): CUSTOMER,
    ('activities', 'activityId'): one(f"select id from customer_activities where \"customerId\"='{CUSTOMER}' limit 1"),
    ('addresses', 'unitId'): one(f"select id from customer_units where \"organizationId\"='{ORG}' limit 1"),
    ('contacts', 'linkId'): one(f"select id from customer_contacts where \"organizationId\"='{ORG}' limit 1"),
    ('documents', 'id'): one(f"select id from documents where \"organizationId\"='{ORG}' and \"userId\" not in ({SUBJECTS}) limit 1"),
    ('drafts', 'id'): one(f"select id from documents where \"organizationId\"='{ORG}' and \"userId\" not in ({SUBJECTS}) limit 1"),
    ('templates', 'id'): one(f"select id from document_templates where \"organizationId\"='{ORG}' limit 1"),
    ('types', 'id'): one(f"select id from document_types where \"organizationId\"='{ORG}' limit 1"),
    ('employees', 'id'): SC_MEMBER, ('users', 'id'): SC_MEMBER, ('workers', 'id'): SC_MEMBER, ('people', 'id'): CUSTOMER,
    ('time-off', 'timeOffId'): one(f"select t.id from time_off_requests t where t.\"technicianId\"='{SC_MEMBER}' limit 1")
        or one(f"select t.id from time_off_requests t join users u on u.id=t.\"technicianId\" where u.\"organizationId\"='{ORG}' and t.\"technicianId\" not in ({SUBJECTS}) limit 1"),
    ('leave-adjustments', 'adjustmentId'): one(f"select id from leave_adjustments where \"organizationId\"='{ORG}' limit 1"),
    ('members', 'id'): SC_MEMBER,
    ('roles', 'id'): one(f"select id from roles where \"organizationId\"='{ORG}' and scope='ORG' and \"personalAssignmentId\" is null limit 1"),
    ('locations', 'id'): SC, ('locations', 'spaceId'): SC, ('spaces', 'spaceId'): SC, ('workspaces', 'spaceId'): SC,
    ('resync', 'spaceId'): SC, ('shared-spaces', 'spaceId'): SC, ('{spaceId}', 'workflowId'): WORKFLOW,
    ('members', 'assignmentId'): one(f"select id from space_assignments where \"spaceId\"='{SC}' and \"userId\" not in ({SUBJECTS}) limit 1"),
    ('members', 'memberId'): SC_MEMBER,
    ('roles', 'roleId'): one(f"select id from roles where \"organizationId\"='{ORG}' and scope='SPACE' and \"personalAssignmentId\" is null limit 1"),
    ('work-roles', 'roleId'): one(f"select id from roles where \"organizationId\"='{ORG}' and kind='WORK' limit 1"),
    ('units', 'unitId'): one(f"select id from customer_units where \"organizationId\"='{ORG}' limit 1"),
    ('units', 'id'): one(f"select id from customer_units where \"organizationId\"='{ORG}' limit 1"),
    ('shares', 'shareId'): one(f"select s.id from space_shares s where s.\"ownerOrgId\"='{ORG}' limit 1"),
    ('shared-spaces', 'shareId'): one(f"select s.id from space_shares s where s.\"ownerOrgId\"='{ORG}' limit 1"),
    ('entries', 'id'): ENTRY, ('entries', 'entryId'): ENTRY, ('approvals', 'id'): ENTRY,
    ('breaks', 'id'): one(f"select b.id from breaks b where b.\"timeEntryId\"='{ENTRY}' limit 1")
        or one(f"select b.id from breaks b join time_entries e on e.id=b.\"timeEntryId\" where e.\"organizationId\"='{ORG}' and e.\"userId\" not in ({SUBJECTS}) limit 1"),
    ('overtime', 'id'): one(f"select id from overtime_requests where \"organizationId\"='{ORG}' and \"technicianId\" not in ({SUBJECTS}) limit 1"),
    ('extra-time', 'id'): one(f"select id from overtime_requests where \"organizationId\"='{ORG}' and \"technicianId\" not in ({SUBJECTS}) limit 1"),
    ('no-shows', 'id'): one(f"select id from shift_instances where \"organizationId\"='{ORG}' and \"userId\" not in ({SUBJECTS}) limit 1"),
    ('excursions', 'id'): one(f"select id from geofence_excursions where \"organizationId\"='{ORG}' and \"userId\" not in ({SUBJECTS}) limit 1"),
    ('worklog', 'noteId'): one(f"select id from time_entry_notes where \"organizationId\"='{ORG}' and \"userId\" not in ({SUBJECTS}) limit 1"),
    ('break-rules', 'id'): one(f"select id from break_rules where \"organizationId\"='{ORG}' limit 1"),
    ('events', 'id'): one(f"select id from calendar_events where \"organizationId\"='{ORG}' limit 1"),
    ('holidays', 'id'): one(f"select id from calendar_holidays where \"organizationId\"='{ORG}' limit 1"),
    ('conversations', 'id'): CONV, ('groups', 'id'): CONV,
    ('messages', 'id'): one(f"select m.id from messages m join conversations c on c.id=m.\"conversationId\" where c.\"organizationId\"='{ORG}' and not exists (select 1 from conversation_members x where x.\"conversationId\"=c.id and x.\"userId\" in ({ATTACKERS})) limit 1"),
    ('chat-members', 'userId'): one(f"select \"userId\" from conversation_members where \"conversationId\"='{CONV}' limit 1"),
    ('invoices', 'id'): INVOICE, ('items', 'itemId'): one(f"select i.id from invoice_items i join invoices v on v.id=i.\"invoiceId\" where v.\"organizationId\"='{ORG}' limit 1"),
    ('legal-entities', 'id'): one(f"select id from legal_entities where \"organizationId\"='{ORG}' limit 1"),
    ('recurring-tasks', 'id'): one(f"select id from recurring_task_templates where \"organizationId\"='{ORG}' limit 1"),
    ('asset-categories', 'id'): one(f"select id from asset_categories where \"organizationId\"='{ORG}' limit 1"),
    ('asset-categories', 'categoryId'): one(f"select id from asset_categories where \"organizationId\"='{ORG}' limit 1"),
    ('asset-types', 'id'): one(f"select id from asset_types where \"organizationId\"='{ORG}' limit 1"),
    ('custom-fields', 'id'): one(f"select id from custom_field_definitions where \"organizationId\"='{ORG}' limit 1"),
    ('epics', 'id'): one(f"select id from epics where \"organizationId\"='{ORG}' limit 1"),
    ('phases', 'id'): one(f"select id from phases where \"organizationId\"='{ORG}' limit 1"),
    ('sprints', 'id'): one(f"select id from sprints where \"organizationId\"='{ORG}' limit 1"),
    ('workflows', 'id'): WORKFLOW, ('workflows', 'workflowId'): WORKFLOW,
    ('statuses', 'statusId'): one(f"select id from workflow_statuses where \"workflowId\"='{WORKFLOW}' limit 1"),
    ('definition-of-done', 'dodId'): one(f"select id from definition_of_done where \"organizationId\"='{ORG}' limit 1"),
    ('portals', 'id'): PORTAL,
    ('requests', 'id'): one(f"select id from tasks where \"organizationId\"='{ORG}' and source='CUSTOMER_PORTAL' limit 1"),
    ('categories', 'id'): one(f"select id from intake_categories where \"organizationId\"='{ORG}' limit 1"),
    ('residents', 'customerId'): one(f"select id from customers where \"organizationId\"='{ORG}' and \"portalId\" is not null limit 1"),
    ('reports', 'id'): REPORT, ('parts', 'partId'): one(f"select p.id from parts_used p join service_reports r on r.id=p.\"reportId\" where r.\"organizationId\"='{ORG}' limit 1"),
    ('analytics-reports', 'id'): one(f"select id from report_definitions where \"organizationId\"='{ORG}' limit 1"),
    ('schedules', 'id'): one(f"select id from report_schedules where \"organizationId\"='{ORG}' limit 1"),
    ('rota', 'id'): one(f"select id from shift_instances where \"organizationId\"='{ORG}' and \"userId\" not in ({SUBJECTS}) limit 1"),
    ('shifts', 'id'): one(f"select id from shifts where \"organizationId\"='{ORG}' order by (\"spaceId\"='{SC}') desc limit 1"),
    ('shift-issues', 'id'): one(f"select id from shift_issues where \"organizationId\"='{ORG}' limit 1"),
    ('rules', 'id'): one(f"select id from approval_rules where \"organizationId\"='{ORG}' limit 1"),
    ('stand-ins', 'id'): one(f"select id from approval_delegations where \"organizationId\"='{ORG}' limit 1"),
    ('invitations', 'id'): one(f"select id from invitations where \"organizationId\"='{ORG}' limit 1"),
    ('join-requests', 'id'): one(f"select id from join_requests where \"organizationId\"='{ORG}' limit 1"),
    ('tickets', 'id'): one(f"select id from support_tickets where \"organizationId\"='{ORG}' limit 1"),
    ('share-requests', 'requestId'): one(f"select r.id from space_share_requests r join company_locations c on c.id=r.\"spaceId\" where c.\"organizationId\"='{ORG}' limit 1"),
    ('space-roles', 'id'): one(f"select id from roles where \"organizationId\"='{ORG}' and scope='SPACE' and \"personalAssignmentId\" is null limit 1"),
    ('space-roles', 'roleId'): one(f"select id from roles where \"organizationId\"='{ORG}' and scope='SPACE' and \"personalAssignmentId\" is null limit 1"),
}
# Not about a record of the organization: public lookups, the platform's own catalogue, a code being checked.
NOT_A_RECORD = {('countries', 'code'), ('posts', 'slug'), ('images', 'id'), ('validate', 'code'),
                ('validate-org-code', 'code'), ('push-token', 'token'), ('library', 'templateId')}
SKIP = re.compile(r'^/(platform|auth|billing/webhooks|calendar-feed|public|app/version|health|metrics|sign/|blog)')


def fill(path):
    segs = path.split('/')
    out = []
    for i, s in enumerate(segs):
        m = re.fullmatch(r'\{(\w+)\}', s)
        if not m:
            out.append(s)
            continue
        prev, head = segs[i - 1], segs[1]
        key = (prev, m.group(1))
        if key in NOT_A_RECORD:
            return None, 'not a record'
        if m.group(1) == 'attachmentId':
            key = (f'{head}-attachments', 'attachmentId')
        elif prev == 'members' and head == 'chat':
            key = ('chat-members', 'userId')
        elif prev == 'reports' and head == 'analytics':
            key = ('analytics-reports', 'id')
        elif prev == 'members' and m.group(1) == 'id':
            key = ('members', 'id')
        val = IDS.get(key)
        if not val:
            return None, f'no id for {key}'
        out.append(str(val))
    return '/'.join(out), None


# ── C. the database fingerprint ─────────────────────────────────────────────────────────────────────────────────────
NOISE = {'refresh_tokens', 'activity_logs', 'location_history', 'notification_deliveries', 'cron_locks', 'health_metrics',
         'daily_metrics', 'worker_last_locations', 'approval_notices', 'sync_tombstones', 'label_check_findings',
         'label_check_runs', 'time_entry_presence', 'platform_audit_logs', 'billing_events', '_prisma_migrations',
         'password_reset_tokens', 'user_push_tokens', 'device_keys',
         'document_events'}  # opening a document is logged ON PURPOSE (DOWNLOADED) — a read, not a change
TABLES = [t for t in sql("select tablename from pg_tables where schemaname='public'").split('\n') if t and t not in NOISE]
HAS_UPDATED = set(sql("select table_name from information_schema.columns where column_name='updatedAt'").split('\n'))
HAS_ORG = set(sql("select table_name from information_schema.columns where column_name='organizationId'").split('\n'))


def fingerprint():
    parts = []
    for t in TABLES:
        # users.updatedAt moves on every sign-in (last seen) — their COUNT is what an attack would change.
        upd = f', max("updatedAt")' if t in HAS_UPDATED and t not in ('users', 'organizations') else ", ''"
        # Only THIS organization's rows where the table says whose a row is: the other organization may change its own.
        where = f" where \"organizationId\"='{ORG}'" if t in HAS_ORG else ''
        parts.append(f"select '{t}', count(*){upd}::text from \"{t}\"{where}")
    rows = sql(' union all '.join(parts))
    return dict((l.split('|')[0], l) for l in rows.split('\n') if l)


ROUTES = [(m.upper(), p[len('/api/v1'):]) for p, v in
          json.loads(urllib.request.urlopen(B.replace('/api/v1', '') + '/docs-json', timeout=30).read())['paths'].items()
          for m in v if m in ('get', 'post', 'put', 'patch', 'delete')]
RECORD_ROUTES = [(m, p) for m, p in ROUTES if '{' in p and not SKIP.match(p)]
WRITES = [(m, p) for m, p in ROUTES if '{' not in p and m != 'GET' and not SKIP.match(p)
          and p not in ('/sync/push',)]  # the phone's outbox replays other writes — covered by those writes

# Records of the workspaces Mike leads or works in are HIS to manage — the leader sweep never gets them.
MIKE_SPACES = "'65902837-95b4-49d0-9468-14bfe06f2717','space-warehouse'"
MINE = set(filter(None, sql(f"""
  select id from tasks where "spaceId" in ({MIKE_SPACES}) union all
  select a.id from assets a join asset_categories c on c.id=a."categoryId" where c."spaceId" in ({MIKE_SPACES}) union all
  select id from shifts where "spaceId" in ({MIKE_SPACES}) union all
  select id from shift_instances where "spaceId" in ({MIKE_SPACES}) union all
  select id from time_entries where "locationId" in ({MIKE_SPACES}) union all
  select b.id from breaks b join time_entries e on e.id=b."timeEntryId" where e."locationId" in ({MIKE_SPACES}) union all
  select id from overtime_requests where "timeEntryId" in (select id from time_entries where "locationId" in ({MIKE_SPACES})) union all
  select id from customers where "spaceId" in ({MIKE_SPACES}) union all
  select id from calendar_events where "spaceId" in ({MIKE_SPACES}) union all
  select id from break_rules where "spaceId" in ({MIKE_SPACES}) union all
  select id from approval_rules where "spaceId" in ({MIKE_SPACES}) union all
  select id from portals where "spaceId" in ({MIKE_SPACES}) union all
  select id from recurring_task_templates where "spaceId" in ({MIKE_SPACES}) union all
  select id from time_entry_notes where "timeEntryId" in (select id from time_entries where "locationId" in ({MIKE_SPACES})) union all
  select id from geofence_excursions where "spaceId" in ({MIKE_SPACES})""").split('\n')))

filled, unfillable = {}, {}
for m, p in RECORD_ROUTES:
    url, why = fill(p)
    (filled if url else unfillable)[(m, p)] = url or why
print(f'\nrecord routes: {len(RECORD_ROUTES)} · with a real id: {len(filled)} · not a record of the organization: '
      f'{sum(1 for v in unfillable.values() if v == "not a record")} · no record of that kind exists locally: '
      f'{sum(1 for v in unfillable.values() if v != "not a record")}')
missing = sorted({v for v in unfillable.values() if v != 'not a record'})
if missing:
    print('      no local record for: ' + ', '.join(missing))
print(f'writes without an id: {len(WRITES)}')

# ── A + B + C: the sweep, person by person ──────────────────────────────────────────────────────────────────────────
lines, leaks, errors = [], [], []
for who, (tok, _) in PEOPLE.items():
    before = fingerprint()
    unthrottle()
    n = 0
    for (method, path), url in list(filled.items()) + [((m, p), p) for m, p in WRITES]:
        if who == 'leader' and any(part in MINE for part in url.split('/')):
            continue
        body = None if method in ('GET', 'DELETE') else {}
        s, raw = call(method, url, tok, body)
        if s == 429:
            unthrottle()
            s, raw = call(method, url, tok, body)
        n += 1
        if n % 150 == 0:
            unthrottle()
        c = klass(s, raw)
        lines.append(f'{who:<9} {method:<6} {path}  {c}')
        if (c == '5xx' or c == 'none') and not (s == 503 and path.startswith('/billing/')):
            errors.append(f'{who} {method} {path} → {s}')
        if who == 'other-org' and c == '2xx' and '{' in path:
            leaks.append(f'{method} {path} → {s} {raw[:140]!r}')
    after = fingerprint()
    changed = [f'{t}: {before.get(t)} → {after.get(t)}' for t in TABLES if before.get(t) != after.get(t)]
    check(f'{who}: the database is unchanged after {n} calls', not changed, changed[:8])

check('another organization reads nothing of this one, on any route', not leaks, leaks[:10])
check('no route answers anybody with a server error', not errors, errors[:10])
if UPDATE or not os.path.exists(MAP_FILE):
    open(MAP_FILE, 'w').write('# Layer 1 record map — routes with a record id (Service Center records where they have a '
                              'workspace) and writes,\n# asked with an empty body by four people. Reviewed by a person; '
                              'regenerate after a REVIEWED change with --update-map.\n' + '\n'.join(sorted(lines)) + '\n')
    print(f'      map written: {len(lines)} answers')
else:
    old = set(l for l in open(MAP_FILE).read().splitlines() if l and not l.startswith('#'))
    new = set(lines)
    gone = sorted(old - new)
    came = sorted(new - old)
    check('every answer is the reviewed one', not came, came[:12])
    if gone and not came:
        print(f'      {len(gone)} reviewed answers no longer seen (routes removed?)')

# ── D. the workspace boundary — what Mike's LISTS carry ─────────────────────────────────────────────────────────────
print('\n── D. a leader of Main Office reads nothing of Service Center')
mike_tok, mike_id = PEOPLE['leader']


def ids_in(path):
    d = data(call('GET', path, mike_tok)[1])
    if isinstance(d, dict):
        d = d.get('items') or d.get('data') or d.get('rows') or d.get('entries') or []
    return {x.get('id') for x in d if isinstance(x, dict)} if isinstance(d, list) else set()


def sc_ids(q):
    return set(filter(None, sql(q).split('\n')))


sc_tasks = sc_ids(f"select id from tasks where \"spaceId\"='{SC}' and id not in (select \"taskId\" from task_assignees where \"userId\"='{mike_id}') and coalesce(\"assignedToId\",'')<>'{mike_id}' and coalesce(\"createdById\",'')<>'{mike_id}'")
seen = ids_in('/tasks?limit=200')
check(f"his job list holds none of Service Center's {len(sc_tasks)} jobs", not (seen & sc_tasks), list(seen & sc_tasks)[:5])
sc_entries = sc_ids(f"select id from time_entries where \"locationId\"='{SC}' and \"userId\"<>'{mike_id}'")
seen = ids_in('/attendance/all-entries?limit=200') | ids_in('/attendance/entries?limit=200')
check(f"his hours lists hold none of the {len(sc_entries)} entries clocked at Service Center",
      not (seen & sc_entries), list(seen & sc_entries)[:5])
for path in [f'/spaces/{SC}/roles', f'/locations/{SC}/members', f'/spaces/{SC}/members', f'/tracking/spaces/{SC}/workers']:
    s, raw = call('GET', path, mike_tok)
    check(f'GET {path} is refused or empty', s in (403, 404) or klass(s, raw) == '2xx-empty', (s, raw[:160]))
sc_members = sc_ids(f"select \"userId\" from space_assignments where \"spaceId\"='{SC}' and \"userId\" not in (select \"userId\" from space_assignments where \"spaceId\" in ('65902837-95b4-49d0-9468-14bfe06f2717','space-warehouse'))")
seen = ids_in('/tracking/workers')
check(f'the live map shows none of the {len(sc_members)} people only in Service Center', not (seen & sc_members),
      list(seen & sc_members)[:5])
s, raw = call('PATCH', f'/tasks/{TASK}', mike_tok, {'title': 'layer1 attack'})
check("he cannot edit a Service Center job", s in (403, 404), (s, raw[:160]))
s, raw = call('POST', f'/tasks/{TASK}/assign', mike_tok, {'technicianId': mike_id})
check("he cannot assign himself a Service Center job", s in (400, 403, 404), (s, raw[:160]))
check('…and the job is untouched', one(f"select title from tasks where id='{TASK}'") != 'layer1 attack')

print('\nALL PASSED' if not FAILED else f'\n{len(FAILED)} FAILED')
sys.exit(1 if FAILED else 0)
