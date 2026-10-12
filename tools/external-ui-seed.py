#!/usr/bin/env python3
"""
A client's site to try the external role builder BY HAND (web + phone) — LOCAL ONLY.

Builds, in the seed-demo organization (client@example.com / password123):
  - workspace "Weingärtner Laakirchen" (CUSTOMER) running tasks, CRM, assets,
    the client portal, time tracking and tracking — and "Other site" beside it,
  - Klaus Huber, an EXTERNAL member assigned to Weingärtner only
    (klaus.huber@weingaertner.example / password123), with NO permissions yet —
    you give them in the builder,
  - Lisa Adler and Hassan Berger on Weingärtner, Noor Shah on Other site,
  - a "Lifts" kind (held by one member, logbook: Use with an hour meter, Damage)
    with three records, and one record on Other site,
  - a portal with two waiting requests and one already turned into a job,
  - clients on both sites, two shifts to approve on each.

Re-running resets it. `--remove` deletes it. Never point it at production.
"""
import subprocess, sys

ORG = 'cmoyg9pzs0000sbtcdb6r9de7'
A, B = 'ui-ext-weingaertner', 'ui-ext-other'
KLAUS, KLAUS_EMAIL = 'ui-ext-klaus', 'klaus.huber@weingaertner.example'
MODS = '["tasks","crm","assets","b2c_portal","time_tracking","tracking"]'
KIND_CONFIG = (
    '{"holder":{"enabled":true,"label":"Operator","members":true},'
    '"logTypes":['
    '{"key":"use","label":"Use","color":"teal","fields":[{"key":"hours","label":"Hour meter","type":"number","required":true,"unit":"h","meter":true}]},'
    '{"key":"damage","label":"Damage","color":"red","fields":[{"key":"what","label":"What happened","type":"text","required":true},{"key":"photo","label":"Photo","type":"photo","required":false}]}'
    ']}'
)


def sql(q):
    r = subprocess.run(['docker', 'exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-v', 'ON_ERROR_STOP=1', '-Atc', q],
                       capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr + '\n' + q)
    return r.stdout.strip()


def uid(email): return sql(f"select id from users where email='{email}'")


def remove():
    ws = f"('{A}','{B}')"
    sql(f"delete from location_history where \"taskId\" in (select id from tasks where \"spaceId\" in {ws} or id like 'ui-ext-%')")
    sql(f"delete from task_events where \"taskId\" in (select id from tasks where \"spaceId\" in {ws} or id like 'ui-ext-%')")
    sql(f"delete from task_assignees where \"taskId\" in (select id from tasks where \"spaceId\" in {ws} or id like 'ui-ext-%')")
    sql(f"delete from tasks where \"spaceId\" in {ws} or id like 'ui-ext-%'")
    sql("delete from asset_money where \"assetId\" like 'ui-ext-%'")
    sql("delete from asset_custody where \"assetId\" like 'ui-ext-%'")
    sql("delete from asset_holders where \"assetId\" like 'ui-ext-%'")
    sql("delete from asset_activities where \"assetId\" like 'ui-ext-%'")
    sql("delete from assets where id like 'ui-ext-%'")
    sql("delete from asset_categories where id like 'ui-ext-%'")
    sql("delete from customers where id like 'ui-ext-%' or \"spaceId\" in " + ws)
    sql("delete from customer_units where id like 'ui-ext-%'")
    sql("delete from portals where id like 'ui-ext-%'")
    sql(f"delete from breaks where \"timeEntryId\" in (select id from time_entries where \"locationId\" in {ws})")
    sql(f"delete from time_entries where \"locationId\" in {ws}")
    sql(f"delete from roles where \"personalAssignmentId\" in (select id from space_assignments where \"spaceId\" in {ws})")
    sql(f"delete from space_assignments where \"spaceId\" in {ws}")
    sql(f"delete from refresh_tokens where \"userId\"='{KLAUS}'")
    sql(f"delete from users where id='{KLAUS}'")
    sql(f"delete from company_locations where id in {ws}")


remove()
if '--remove' in sys.argv:
    print('removed'); sys.exit(0)

ADMIN, LISA, HASSAN, NOOR = uid('client@example.com'), uid('lisa@example.com'), uid('hassan@example.com'), uid('noor@example.com')
for ws, name, lat in ((A, 'Weingärtner Laakirchen', 47.9813), (B, 'Other site', 47.9186)):
    sql(f"""insert into company_locations (id,"organizationId",name,address,lat,lng,"geofenceRadius",timezone,"workModel","geofencePolicy",kind,"enabledModules","isActive","isRemote","isDefault","createdAt","updatedAt")
            values ('{ws}','{ORG}','{name}','Laakirchen',{lat},13.8269,100,'Europe/Vienna','NONE','STRICT','CUSTOMER','{MODS}',true,false,false,now(),now())""")

sql(f"""insert into users (id,email,"passwordHash","firstName","lastName",role,"organizationId","isExternal","onboardingCompleted","enabledModules","updatedAt")
        select '{KLAUS}','{KLAUS_EMAIL}',"passwordHash",'Klaus','Huber','EMPLOYEE','{ORG}',true,true,'{{"modules":["tasks"],"platforms":"both"}}',now() from users where email='mike@example.com'""")


def assign(i, user, ws, primary=False):
    sql(f"""insert into space_assignments (id,"organizationId","userId","spaceId","isPrimary","allowSecondRole","effectiveFrom","createdAt","updatedAt")
            values ('ui-ext-sa-{i}','{ORG}','{user}','{ws}',{str(primary).lower()},false,now()-interval '30 days',now(),now())""")


assign('klaus', KLAUS, A, True)
assign('lisa', LISA, A); assign('hassan', HASSAN, A); assign('noor', NOOR, B)

# Equipment
for ws, k in ((A, 'a'), (B, 'b')):
    sql(f"""insert into asset_categories (id,"organizationId",name,"spaceId",config,"updatedAt") values ('ui-ext-lifts-{k}','{ORG}','Lifts','{ws}','{KIND_CONFIG}',now())""")
for i, (name, serial, status, k) in enumerate([
    ('Scissor lift Genie GS-1930', 'GS30-188421', 'ACTIVE', 'a'),
    ('Mast lift JLG Toucan 8E', 'JLG-T8E-5520', 'ACTIVE', 'a'),
    ('Boom lift Haulotte HA16', 'HA16-90211', 'MAINTENANCE', 'a'),
    ('Other site lift (must stay hidden)', 'OS-0001', 'ACTIVE', 'b'),
]):
    sql(f"""insert into assets (id,"organizationId",name,"serialNumber",status,"categoryId","updatedAt") values ('ui-ext-asset-{i}','{ORG}','{name}','{serial}','{status}','ui-ext-lifts-{k}',now())""")
sql(f"""insert into asset_money (id,"organizationId","assetId","logType",category,direction,"amountCents","values",status,"authorId","occurredAt","createdAt")
        values ('ui-ext-log-1','{ORG}','ui-ext-asset-0','use','Use','OUT',0,'{{"hours":1284}}','RECORDED','{LISA}',now()-interval '1 day',now())""")

# Clients
for i, (ws, name) in enumerate([(A, 'Hausverwaltung Weingärtner'), (A, 'M. Gruber'), (B, 'Other site client (must stay hidden)')]):
    sql(f"""insert into customers (id,"organizationId",name,"spaceId",type,status,"updatedAt") values ('ui-ext-cust-{i}','{ORG}','{name}','{ws}','PERSON','CUSTOMER',now())""")

# Portal + requests
sql(f"""insert into portals (id,"organizationId",name,"templateKey","entityLabel","spaceId","updatedAt") values ('ui-ext-portal','{ORG}','Weingärtner residents','rental','Apartment','{A}',now())""")
sql(f"""insert into customer_units (id,"organizationId",name,address,"updatedAt") values ('ui-ext-unit','{ORG}','Flat 4/12','Haus B, Laakirchen',now())""")
sql("update customers set \"portalId\"='ui-ext-portal' where id='ui-ext-cust-1'")
for i, (title, desc, triaged) in enumerate([
    ('Light out in stairwell B', 'The light on the 3rd floor of stairwell B has been out since Sunday. It is completely dark in the evening.', False),
    ('Water under the kitchen sink', 'There is a small puddle under the sink every morning.', False),
    ('Front door does not close', 'The main door of Haus B stays open.', True),
]):
    sql(f"""insert into tasks (id,title,description,"organizationId","createdById","customerId","unitId",source,triaged,status,priority,"spaceId","createdAt","updatedAt")
            values ('ui-ext-req-{i}','{title}','{desc}','{ORG}','{ADMIN}','ui-ext-cust-1','ui-ext-unit','CUSTOMER_PORTAL',{str(triaged).lower()},
                    '{'NEW' if triaged else 'NEW'}','MEDIUM',{f"'{A}'" if triaged else 'NULL'},now()-interval '{i+1} hours',now())""")

# Hours to approve
for ws, k, who in ((A, 'a', LISA), (B, 'b', NOOR)):
    for n in (1, 2):
        sql(f"""insert into time_entries (id,"organizationId","userId","locationId",status,"clockInAt","clockOutAt","clockInLat","clockInLng","approvalStatus","flagReasons","totalMinutes","createdAt","updatedAt")
                values ('ui-ext-te-{k}{n}','{ORG}','{who}','{ws}','CLOCKED_OUT',now()-interval '{n+1} days',now()-interval '{n+1} days'+interval '8 hours',47.98,13.83,'PENDING','{{LATE_ARRIVAL}}',480,now(),now())""")

print(f"""ready
  web     http://localhost:3000   admin client@example.com / password123
  external {KLAUS_EMAIL} / password123  (no permissions yet — give them in the builder)
  workspace '{A}' (Weingärtner Laakirchen), and '{B}' (Other site)""")
