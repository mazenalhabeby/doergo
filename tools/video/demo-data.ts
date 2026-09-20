/**
 * The cast. Every name, address, email and phone number on this page is
 * invented.
 *
 * ⚠️ THIS FILE IS A PRIVACY CONTROL, NOT SET DRESSING.
 *
 * These videos are published on YouTube, where they are indexed and cannot be
 * unpublished from anybody's cache. The development database holds real
 * people: actual customers, actual staff, their real email addresses and real
 * phone numbers. One frame that catches a real name in a task list is a GDPR
 * disclosure that cannot be taken back.
 *
 * So the recording never happens in an existing organisation. It happens in
 * this one, which contains nobody. The rules the data follows:
 *
 *   • Email domains end in `.example` — RFC 2606 reserves it permanently, so
 *     these addresses can never be delivered to and can never belong to a
 *     person. No `@gmail.com`, no `@hbc-group.eu`, not even a plausible
 *     company domain, because a plausible domain is one somebody may register.
 *
 *   • Phone numbers come from Ofcom's drama ranges — +44 7700 900000-900999
 *     and +44 20 7946 0000-0999. These are the only numbers in Europe a
 *     regulator has permanently withheld from allocation precisely so that
 *     fiction can show them. A "clearly fake" number that is merely unlikely
 *     (+43 1 234 5678) is somebody's line.
 *
 *   • Street names are invented. Real street names with invented numbers still
 *     drop a pin on a real building, and the app renders addresses on a map.
 *
 *   • Coordinates sit on open industrial land, not on a real company's door.
 *
 *   • Nothing is copied from any existing seed. `seed-demo.ts` and friends use
 *     names that may mirror real staff, and the whole point is to share none
 *     of their surface.
 *
 * The organisation is deliberately British: it lets the phone numbers come
 * from a range a regulator guarantees is fictional, and the narration is
 * English anyway.
 */

/** Marks every row this seed owns, so a re-run cleans up after itself and only itself. */
export const VIDEO_ORG_NAME = 'Halstead Field Services';

/** Unique across all orgs; a join code collision would fail the seed. */
export const VIDEO_JOIN_CODE = 'HALSTEAD1';

export const ORG_TIMEZONE = 'Europe/London';
export const ORG_CURRENCY = 'GBP';

/**
 * The depot the recording session stands in.
 *
 * ⚠️ The capture script reads these same coordinates and tells the browser it
 * is standing on them. They live here, once, because the two must agree: if
 * the browser is outside the ring the server refuses the clock-in, and the
 * video ends on an error toast. A point on the open ground of an industrial
 * estate east of Reading — no building, no business.
 */
export const DEPOT = {
  id: 'video-space-depot',
  name: 'Halstead Depot',
  address: 'Unit 4, Perrivale Way, Reading RG2',
  lat: 51.42219,
  lng: -0.9503,
  /**
   * 150 m rather than the 50 m default. The browser is told it is standing
   * exactly on the pin, so any radius would do — but a generous ring means a
   * hand-run of the flow from a real laptop nearby still records.
   */
  geofenceRadius: 150,
} as const;

export const WORKSHOP = {
  id: 'video-space-workshop',
  name: 'Kesterton Road Workshop',
  address: '12 Kesterton Road, Slough SL1',
  lat: 51.51163,
  lng: -0.60422,
  geofenceRadius: 90,
} as const;

/** A client site. CUSTOMER-kind spaces are where invoices are billed from. */
export const CLIENT_SITE = {
  id: 'video-space-brambleside',
  name: 'Brambleside Retail Park',
  address: 'Brambleside Retail Park, Maidenhead SL6',
  lat: 51.5215,
  lng: -0.7212,
  geofenceRadius: 120,
} as const;

/**
 * The client portal's id, fixed like the workspaces' are.
 *
 * ⚠️ WHY A LITERAL. The portal list does not open its own detail — clicking a
 * card navigates nowhere — so the only way to film the portal's own page is to
 * visit it by URL, and a flow cannot ask the database for an id. Same trick as
 * DEPOT.id, for the same reason.
 */
export const PORTAL_ID = 'video-portal-brambleside';

export interface DemoPerson {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  phone: string;
}

/**
 * The member every flow signs in as.
 *
 * An operations supervisor rather than an admin or a plain field engineer,
 * because she is the one persona who legitimately sees both halves of the
 * attendance story: she clocks herself in like anybody else, and she holds
 * `canViewAllTasks`, so the team attendance board is hers too. One login,
 * one continuous recording, both tours covered.
 */
export const LEAD: DemoPerson = {
  key: 'lead',
  firstName: 'Mara',
  lastName: 'Kellner',
  email: 'mara.kellner@halsteadfield.example',
  position: 'Operations Supervisor',
  phone: '+44 7700 900118',
};

/** The org owner. Never recorded as; exists so the org has an owner. */
export const OWNER: DemoPerson = {
  key: 'owner',
  firstName: 'Douglas',
  lastName: 'Ferriby',
  email: 'douglas.ferriby@halsteadfield.example',
  position: 'Managing Director',
  phone: '+44 20 7946 0142',
};

/** The crew. Enough people that a team board looks like a business. */
export const CREW: DemoPerson[] = [
  { key: 'rhodes', firstName: 'Priya', lastName: 'Rhodes', email: 'priya.rhodes@halsteadfield.example', position: 'Senior Field Engineer', phone: '+44 7700 900231' },
  { key: 'okafor', firstName: 'Tobias', lastName: 'Okafor', email: 'tobias.okafor@halsteadfield.example', position: 'Refrigeration Engineer', phone: '+44 7700 900344' },
  { key: 'brennan', firstName: 'Niamh', lastName: 'Brennan', email: 'niamh.brennan@halsteadfield.example', position: 'Electrical Engineer', phone: '+44 7700 900457' },
  { key: 'valdes', firstName: 'Elena', lastName: 'Valdes', email: 'elena.valdes@halsteadfield.example', position: 'HVAC Technician', phone: '+44 7700 900562' },
  { key: 'whitlock', firstName: 'Samuel', lastName: 'Whitlock', email: 'samuel.whitlock@halsteadfield.example', position: 'Maintenance Technician', phone: '+44 7700 900673' },
  { key: 'nakamura', firstName: 'Iris', lastName: 'Nakamura', email: 'iris.nakamura@halsteadfield.example', position: 'Workshop Technician', phone: '+44 7700 900784' },
  { key: 'devlin', firstName: 'Conor', lastName: 'Devlin', email: 'conor.devlin@halsteadfield.example', position: 'Plumbing Engineer', phone: '+44 7700 900895' },
  { key: 'achterberg', firstName: 'Lotte', lastName: 'Achterberg', email: 'lotte.achterberg@halsteadfield.example', position: 'Scheduler', phone: '+44 7700 900906' },
];

/**
 * Somebody from the client's side, invited in to watch the work.
 *
 * ⚠️ EXTERNAL, and that is a fact about the RELATIONSHIP rather than a
 * permission somebody remembered to leave off. They hold no clock, no leave and
 * no personnel file, the organisation's own property is closed to them
 * whatever their role says, and their whole authority is one role in the
 * workspaces they were given.
 */
export const OUTSIDER: DemoPerson = {
  key: 'outsider',
  firstName: 'Ada',
  lastName: 'Pemberton',
  email: 'ada.pemberton@brambleside-retail.example',
  position: 'Facilities Manager, Brambleside Retail Park',
  phone: '+44 20 7946 0211',
};

/** One password for everyone. This organisation exists only on a laptop. */
export const DEMO_PASSWORD = 'VideoDemo!2026';

/**
 * Client companies. All invented; none is a rename of a real customer.
 * `.example` again, and Ofcom drama landlines.
 */
export const CLIENTS = [
  { name: 'Brambleside Retail Park', contactName: 'Ada Pemberton', email: 'facilities@brambleside-retail.example', phone: '+44 20 7946 0211', address: 'Brambleside Retail Park, Maidenhead SL6', industry: 'Retail' },
  { name: 'Thorncastle Logistics', contactName: 'Marcus Idowu', email: 'sites@thorncastle-logistics.example', phone: '+44 20 7946 0318', address: 'Gate 2, Ellisfield Way, Slough SL3', industry: 'Logistics' },
  { name: 'Wrenfield Care Homes', contactName: 'Helena Sarkar', email: 'estates@wrenfieldcare.example', phone: '+44 20 7946 0427', address: '8 Coombe Rise, Bracknell RG12', industry: 'Healthcare' },
  { name: 'Pilgrove Hotels', contactName: 'Oskar Lindqvist', email: 'maintenance@pilgrovehotels.example', phone: '+44 20 7946 0533', address: '40 Marchmont Street, Reading RG1', industry: 'Hospitality' },
  { name: 'Ledbury Foods', contactName: 'Sasha Obuya', email: 'plant@ledburyfoods.example', phone: '+44 20 7946 0649', address: 'Ledbury Works, Hartsmere Lane, Newbury RG14', industry: 'Food production' },
  { name: 'Castlemere Schools Trust', contactName: 'Gregor Halloran', email: 'premises@castlemere-trust.example', phone: '+44 20 7946 0754', address: 'Castlemere House, Torrington Road, Woking GU21', industry: 'Education' },
] as const;

/** Jobs. Realistic field-service work, nothing half-finished or test-shaped. */
export const TASKS = [
  { title: 'Chiller unit 3 — loss of cooling', description: 'Rooftop chiller tripping on high pressure since Tuesday. Retail floor holding at 24°C.', priority: 'URGENT', status: 'IN_PROGRESS', client: 'Brambleside Retail Park', assignee: 'okafor', dueInDays: 0 },
  { title: 'Quarterly HVAC service — Block B', description: 'Planned maintenance visit. Filters, belts, coil clean, log readings.', priority: 'MEDIUM', status: 'ASSIGNED', client: 'Wrenfield Care Homes', assignee: 'valdes', dueInDays: 1 },
  { title: 'Loading bay door will not close', description: 'Door 4 sticking at 300mm. Safety edge suspected.', priority: 'HIGH', status: 'ACCEPTED', client: 'Thorncastle Logistics', assignee: 'whitlock', dueInDays: 0 },
  { title: 'Emergency lighting test — annual', description: 'Full three-hour drain test with certificate.', priority: 'MEDIUM', status: 'ASSIGNED', client: 'Castlemere Schools Trust', assignee: 'brennan', dueInDays: 3 },
  { title: 'Cold room 2 — door seal replacement', description: 'Seal perished along the hinge side, icing at the threshold.', priority: 'HIGH', status: 'EN_ROUTE', client: 'Ledbury Foods', assignee: 'rhodes', dueInDays: 0 },
  { title: 'Boiler house — pressure loss investigation', description: 'System topping up twice a week. Trace and repair.', priority: 'HIGH', status: 'IN_PROGRESS', client: 'Pilgrove Hotels', assignee: 'devlin', dueInDays: 0 },
  { title: 'Replace failed extract fan — kitchen', description: 'Motor seized. Unit 400mm inline, replacement in the van.', priority: 'URGENT', status: 'COMPLETED', client: 'Pilgrove Hotels', assignee: 'devlin', dueInDays: -1 },
  { title: 'Fire damper inspection — floors 1-3', description: 'Access hatches, drop test, reset and record.', priority: 'MEDIUM', status: 'COMPLETED', client: 'Brambleside Retail Park', assignee: 'brennan', dueInDays: -2 },
  { title: 'Water heater no. 2 — thermostat fault', description: 'Overheating and locking out. Replace stat and test.', priority: 'MEDIUM', status: 'COMPLETED', client: 'Wrenfield Care Homes', assignee: 'devlin', dueInDays: -3 },
  { title: 'Install sub-meter — production line 2', description: 'New CT clamp meter and pulse output to the BMS.', priority: 'LOW', status: 'ASSIGNED', client: 'Ledbury Foods', assignee: 'brennan', dueInDays: 5 },
  { title: 'AHU 1 — belt slipping', description: 'Squeal on start-up, belt glazed. Replace and re-tension.', priority: 'MEDIUM', status: 'ACCEPTED', client: 'Castlemere Schools Trust', assignee: 'valdes', dueInDays: 2 },
  { title: 'Annual pressure vessel inspection', description: 'Written scheme of examination due. Isolate and present.', priority: 'HIGH', status: 'ASSIGNED', client: 'Ledbury Foods', assignee: 'rhodes', dueInDays: 4 },
  { title: 'Reception air curtain not running', description: 'No response on the switch. Check supply and controller.', priority: 'LOW', status: 'ARRIVED', client: 'Pilgrove Hotels', assignee: 'whitlock', dueInDays: 0 },
  { title: 'Replace corroded pipework — plant room', description: 'Two metres of 42mm on the return, plus two valves.', priority: 'MEDIUM', status: 'BLOCKED', client: 'Thorncastle Logistics', assignee: 'devlin', dueInDays: 1 },
  /*
    ⚠️ THE ONE JOB WITH NOBODY ON IT, and it is here on purpose: video 06 is
    about handing a job to somebody, and every other job in this seed already
    has a name against it. An empty `assignee` becomes a null assignedToId —
    the status stays the flow's first step, because "unassigned" is a missing
    person, not a stage of the work.
  */
  { title: 'Site survey — new tenant fit-out', description: 'Measure up the second floor and list what the fit-out needs.', priority: 'MEDIUM', status: 'ASSIGNED', client: 'Castlemere Schools Trust', assignee: '', dueInDays: 2 },
] as const;

/** Vans and kit, so the Assets screen is not an empty state. */
export const VEHICLES = [
  { name: 'Van 1 — Transit Custom', registration: 'HF19 TRX', holder: 'rhodes', make: 'Ford', model: 'Transit Custom 320', year: '2019' },
  { name: 'Van 2 — Vivaro', registration: 'HF21 KDL', holder: 'okafor', make: 'Vauxhall', model: 'Vivaro 2900', year: '2021' },
  { name: 'Van 3 — Transit Connect', registration: 'HF22 PWS', holder: 'brennan', make: 'Ford', model: 'Transit Connect 250', year: '2022' },
  { name: 'Van 4 — Dispatch', registration: 'HF20 MNH', holder: 'devlin', make: 'Citroën', model: 'Dispatch M', year: '2020' },
] as const;

export const TOOLS = [
  { name: 'Refrigerant recovery unit', serial: 'RRU-4471', holder: 'okafor', make: 'Javac', model: 'Ruby 2' },
  { name: 'Thermal imaging camera', serial: 'TIC-2209', holder: 'rhodes', make: 'FLIR', model: 'E54' },
  { name: 'Multifunction tester', serial: 'MFT-8831', holder: 'brennan', make: 'Megger', model: 'MFT1741' },
  { name: 'Pressure test kit', serial: 'PTK-1150', holder: 'devlin', make: 'Rothenberger', model: 'RP Pro III' },
] as const;
