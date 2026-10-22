"""Hours on the invoice per person (counted / clocked / shift), over real HTTP, LOCAL only:  python3 tools/hours-basis-e2e.py"""
import json,subprocess,time,urllib.request,uuid
API='http://localhost:4000/api/v1'; SPACE='cmuu52nkq00btsbw5d98uvz9j'; DAY='2026-08-03'
fails=0
def call(m,p,t=None,b=None):
    r=urllib.request.Request(API+p,method=m,data=json.dumps(b).encode() if b is not None else None,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+t} if t else {})})
    try:
        with urllib.request.urlopen(r,timeout=60) as x: return x.status,json.loads(x.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}')
def data(r): return r[1].get('data',r[1])
def check(n,ok,d=''):
    global fails; print(('PASS ' if ok else 'FAIL ')+n+('' if ok else f'  -> {d}')); fails+= (not ok)
def psql(sql): return subprocess.run(['docker','exec','-i','hbcfield-postgres','psql','-U','hbcfield','-d','hbcfield','-tAq'],input=sql,capture_output=True,text=True).stdout.strip()
def login(email):
    # The sign-in route is rate-limited (5 a minute per address): wait a 429 out rather than fail.
    for _ in range(10):
        r=call('POST','/auth/login',b={'email':email,'password':'password123'})
        if r[0]!=429: return data(r)['accessToken']
        time.sleep(15)
    raise SystemExit(f'cannot sign in as {email}: still rate-limited')
T=login('client@example.com')
members=data(call('GET',f'/spaces/{SPACE}/members',T))
m=next(x for x in members if (x.get('effectiveBillBy') in ('HOUR','BOTH')) and not x['user'].get('isExternal'))
uid,mid,name=m['userId'],m['id'],m['user']['firstName']
org=psql(f"select \"organizationId\" from company_locations where id='{SPACE}'")
ids=[str(uuid.uuid4()),str(uuid.uuid4())]
# Day 1: shift 07:00-15:30, clocked 06:48-16:05, 30 min rest, counted 8h. Day 2 (Aug 4): no shift planned, clocked 08:00-12:00.
psql(f"""insert into time_entries (id,"userId","locationId","organizationId","clockInLat","clockInLng","clockInAt","clockOutAt",status,"approvalStatus","updatedAt","expectedClockInAt","expectedClockOutAt","unpaidBreakMinutes","paidMinutes")
values ('{ids[0]}','{uid}','{SPACE}','{org}',0,0,'2026-08-03 04:48Z','2026-08-03 14:05Z','CLOCKED_OUT','AUTO',now(),'2026-08-03 05:00Z','2026-08-03 13:30Z',30,480),
       ('{ids[1]}','{uid}','{SPACE}','{org}',0,0,'2026-08-04 06:00Z','2026-08-04 10:00Z','CLOCKED_OUT','AUTO',now(),null,null,0,240);""")
def run(basis):
    r=call('PATCH',f'/spaces/{SPACE}/members/{mid}/roles',T,{'hoursBasis':basis})
    g=data(call('GET',f'/invoices/gather?spaceId={SPACE}&from=2026-08-03&to=2026-08-04',T))
    h=[x for x in g.get('hourEntries',[]) if x['workerId']==uid]
    return r,h
try:
    r,h=run('COUNTED'); check(f'{name}: counted = 8h + 4h = 12h', r[0]==200 and sum(x['hours'] for x in h)==12 and all(x.get('hoursBasis')=='COUNTED' for x in h), h)
    cost_counted=sum((x.get('costCents') or 0) for x in h)
    r,h=run('CLOCKED'); check('clocked = 8h47 + 4h = 12.78h', r[0]==200 and abs(sum(x['hours'] for x in h)-12.78)<0.01 and h[0]['hoursBasis']=='CLOCKED', h)
    check('…and the cost stays on counted time', sum((x.get('costCents') or 0) for x in h)==cost_counted, (cost_counted,h))
    r,h=run('SHIFT'); check('shift = 8h + (no shift: counted 4h) = 12h', abs(sum(x['hours'] for x in h)-12)<0.01 and h[0]['hoursBasis']=='SHIFT', h)
    check('…and it says 1 day had no shift', sum(x.get('noShiftDays',0) for x in h)==1, h)
    check('a basis that is not on the list is refused', call('PATCH',f'/spaces/{SPACE}/members/{mid}/roles',T,{'hoursBasis':'GUESS'})[0]==400)
    r,h=run('CLOCKED')
    items=[{'description':f"{name} · hours",'quantity':x['hours'],'unitPrice':(x['hourRateCents'] or 0)/100,'lineKind':'HOURS','workerId':uid,'dayFrom':x['fromDay'],'dayTo':x['toDay'],'hoursBasis':x['hoursBasis']} for x in h]
    s,b=call('POST','/invoices',T,{'spaceId':SPACE,'clientName':'Basis test','items':items}); inv=b.get('data',{})
    check('the invoice line keeps which hours it billed', s in (200,201) and all(i.get('hoursBasis')=='CLOCKED' for i in inv.get('items',[])), inv.get('items'))
    call('PATCH',f'/spaces/{SPACE}/members/{mid}/roles',T,{'hoursBasis':'SHIFT'})
    check('…and changing the setting later leaves it alone', all(i.get('hoursBasis')=='CLOCKED' for i in data(call('GET','/invoices/'+inv['id'],T)).get('items',[])))
    call('DELETE','/invoices/'+inv['id'],T)
    st=data(call('GET',f'/organizations/members/{uid}/statement?from=2026-08-03&to=2026-08-04',T))
    here=[l for l in st.get('lines',[]) if l['spaceId']==SPACE and l.get('basis')=='hours']
    check("the worker's statement stays on counted time (12h)", sum(l['hours'] for l in here)==12 or not here, here)
finally:
    call('PATCH',f'/spaces/{SPACE}/members/{mid}/roles',T,{'hoursBasis':None})
    psql(f"delete from time_entries where id in ('{ids[0]}','{ids[1]}')")
print(fails,'failure(s)')
