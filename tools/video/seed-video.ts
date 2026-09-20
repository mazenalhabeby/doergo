/**
 * The stage: one entirely fictional organisation, built for the camera.
 *
 * Run it as often as you like — it owns exactly one organisation (by name) and
 * rebuilds it from scratch every time, so a re-render after a product change
 * starts from the same set every time.
 *
 *   node tools/video/seed-video.ts
 *
 * ⚠️ WHY A SEPARATE ORGANISATION AT ALL. See demo-data.ts. The short version:
 * the dev database holds real customers and real staff, the videos go on
 * public YouTube, and a single frame catching a real name is a disclosure that
 * cannot be withdrawn. Recording inside an org that contains nobody is the
 * only version of this that is safe, so the seed is part of the pipeline
 * rather than a convenience.
 *
 * WHY it deletes and rebuilds rather than upserting: a video is a record of a
 * moment. If a previous run left a task in a state the narration no longer
 * describes, the mismatch only shows up when somebody watches the finished
 * file. Rebuilding makes the stage a pure function of this file.
 */

import { PrismaClient, type Prisma } from '@prisma/client';
// Default import, not a namespace: bcryptjs is CommonJS, and under Node's ESM
// interop `import * as` yields the module wrapper rather than its exports.
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import {
  ADD_ON_KEYS,
  BUILTIN_ROLES,
  DEFAULT_ORG_MODULES,
  DEFAULT_WORKFLOW_TEMPLATE,
} from './shared-bridge.ts';
import { assertLocalDatabase } from './config.ts';
import {
  CLIENTS,
  CLIENT_SITE,
  CREW,
  DEMO_PASSWORD,
  DEPOT,
  OUTSIDER,
  PORTAL_ID,
  LEAD,
  ORG_CURRENCY,
  ORG_TIMEZONE,
  OWNER,
  TASKS,
  TOOLS,
  VEHICLES,
  VIDEO_JOIN_CODE,
  VIDEO_ORG_NAME,
  WORKSHOP,
  type DemoPerson,
} from './demo-data.ts';

// Refuse before the client is even constructed. A guard that runs after the
// first query has already run a query against whatever this points at.
assertLocalDatabase(process.env.DATABASE_URL);

const prisma = new PrismaClient();

const DAY_MS = 86_400_000;
const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');
const daysAgo = (d: number) => new Date(Date.now() - d * DAY_MS);
const daysAhead = (d: number) => new Date(Date.now() + d * DAY_MS);

/** A UTC instant on a given past weekday at a given local-ish hour. */
function onDay(daysBack: number, hour: number, minute = 0): Date {
  const base = new Date(Date.now() - daysBack * DAY_MS);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour, minute),
  );
}

/** Weekends make an attendance board look broken, so history skips them. */
function isWeekend(daysBack: number): boolean {
  const day = new Date(Date.now() - daysBack * DAY_MS).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Deterministic jitter. Attendance where everybody clocks in at exactly 08:00
 * reads as fake at a glance; random jitter makes a re-render differ from the
 * last one for no reason. A hash of the inputs gives variety that is stable.
 */
function jitter(seed: string, spread: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % spread;
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Tear down the previous run, and only the previous run
// ───────────────────────────────────────────────────────────────────────────

async function destroyPreviousRun(): Promise<void> {
  const existing = await prisma.organization.findFirst({
    where: { name: VIDEO_ORG_NAME },
    select: { id: true },
  });
  if (!existing) return;

  console.log(`  removing the previous "${VIDEO_ORG_NAME}" (${existing.id})`);

  /*
    Organization cascades to most children, but not all of them: several tables
    reach the org only through a user or a space, and a few carry plain marker
    ids with no foreign key at all. Deleting the org and trusting the cascade
    leaves those behind, and the orphans then appear in the NEXT run's
    org-wide counts. So the tables that matter are cleared explicitly, in
    foreign-key order, before the org goes.
  */
  const orgId = existing.id;
  const userIds = (
    await prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true } })
  ).map((u) => u.id);

  await prisma.break.deleteMany({ where: { timeEntry: { organizationId: orgId } } });
  await prisma.overtimeRequest.deleteMany({ where: { organizationId: orgId } });
  await prisma.timeEntry.deleteMany({ where: { organizationId: orgId } });
  await prisma.shiftAssignment.deleteMany({ where: { organizationId: orgId } });
  await prisma.breakRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.shift.deleteMany({ where: { organizationId: orgId } });
  await prisma.spaceAssignment.deleteMany({ where: { organizationId: orgId } });
  await prisma.assetMoney.deleteMany({ where: { organizationId: orgId } });
  await prisma.assetActivity.deleteMany({ where: { organizationId: orgId } });
  await prisma.assetCustody.deleteMany({ where: { organizationId: orgId } });
  // AssetHolder carries no organizationId — it reaches the org through its asset.
  await prisma.assetHolder.deleteMany({ where: { asset: { organizationId: orgId } } });
  await prisma.asset.deleteMany({ where: { organizationId: orgId } });
  await prisma.assetCategory.deleteMany({ where: { organizationId: orgId } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { organizationId: orgId } } });
  await prisma.invoice.deleteMany({ where: { organizationId: orgId } });
  /*
    ⚠️ ANYTHING A VIDEO CREATES MUST BE CLEARED HERE TOO, and the failure is
    not obvious: the seed dies on a foreign key from a table nobody thought
    about, hours later, on a re-run. Video 09 makes a recurring template, which
    points at the member who created it, so deleting the members fails until it
    is gone.
  */
  await prisma.documentEvent.deleteMany({ where: { document: { organizationId: orgId } } }).catch(() => undefined);
  await prisma.documentSignature.deleteMany({ where: { signer: { document: { organizationId: orgId } } } }).catch(() => undefined);
  await prisma.documentSigner.deleteMany({ where: { document: { organizationId: orgId } } }).catch(() => undefined);
  await prisma.document.deleteMany({ where: { organizationId: orgId } });
  await prisma.documentTemplate.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.documentType.deleteMany({ where: { organizationId: orgId } });
  await prisma.intakeCategory.deleteMany({ where: { portal: { organizationId: orgId } } }).catch(() => undefined);
  await prisma.portal.deleteMany({ where: { organizationId: orgId } });
  await prisma.invitation.deleteMany({ where: { organizationId: orgId } });
  await prisma.joinRequest.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.timeOff.deleteMany({ where: { technician: { organizationId: orgId } } });
  await prisma.locationHistory.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.workerLastLocation.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.recurringTaskTemplate.deleteMany({ where: { organizationId: orgId } });
  await prisma.serviceReport.deleteMany({ where: { organizationId: orgId } });
  await prisma.comment.deleteMany({ where: { task: { organizationId: orgId } } });
  await prisma.taskEvent.deleteMany({ where: { task: { organizationId: orgId } } });
  await prisma.task.deleteMany({ where: { organizationId: orgId } });
  await prisma.customer.deleteMany({ where: { organizationId: orgId } });
  if (userIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  }
  // The owner pointer is a self-reference; clearing it lets the users go first.
  await prisma.organization.update({ where: { id: orgId }, data: { ownerId: null } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.companyLocation.deleteMany({ where: { organizationId: orgId } });
  await prisma.accessRole.deleteMany({ where: { organizationId: orgId } });
  await prisma.workflowStatus.deleteMany({ where: { workflow: { organizationId: orgId } } });
  await prisma.statusWorkflow.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
}

// ───────────────────────────────────────────────────────────────────────────
// 2. The organisation
// ───────────────────────────────────────────────────────────────────────────

async function createOrganization() {
  return prisma.organization.create({
    data: {
      name: VIDEO_ORG_NAME,
      isActive: true,
      joinCode: VIDEO_JOIN_CODE,
      joinCodeHash: hashCode(VIDEO_JOIN_CODE),
      joinPolicy: 'INVITE_ONLY',
      timezone: ORG_TIMEZONE,
      /*
        The company's own details, filled in.

        ⚠️ WHY THE SEED BOTHERS. Video 01 opens the organisation's settings
        while the narration says "this is what you signed up as, and what you
        are billed as". With these null the page is an untouched signup form —
        a blank name field, an empty address — which reads as an account nobody
        has finished setting up. Every one of these values is invented; see the
        rules at the top of demo-data.ts.
      */
      industry: 'HVAC & Refrigeration',
      addressLine1: DEPOT.address,
      city: 'Reading',
      postalCode: 'RG2 0QT',
      country: 'GB',
      phone: '+44 20 7946 0114',
      website: 'https://halsteadfield.example',
      billingEmail: 'accounts@halsteadfield.example',
      vatId: 'GB000000000',
      enabledModules: DEFAULT_ORG_MODULES as unknown as Prisma.InputJsonValue,
      /*
        Every capability on. A feature video cannot show a feature the
        organisation has not bought, and a 402 mid-recording is a wasted take.
        This is the same thing the 14-day trial does for a real signup.
      */
      addOns: [...ADD_ON_KEYS],
      /*
        EXTERNAL means the billing code computes the bill and never calls
        Stripe. ⚠️ Load-bearing: AUTOMATIC would make a seat reconcile try to
        move a subscription that does not exist, and in the worst case reach
        a live Stripe key if one is in the environment.
      */
      billingMode: 'EXTERNAL',
      /*
        ⚠️ ACTIVE, not TRIALING — and only the admin sees the difference.

        The billing banner renders for admins on a trialing org, across every
        screen, as "365 days left in your free trial". The number comes from
        this seed and the real trial is fourteen days, so a video recorded as
        the owner would carry a fictitious offer in the corner of every beat.
        Active organisations get no banner at all. Nothing is gated on it: the
        capabilities come from `addOns` above, which are all of them.
      */
      subStatus: 'ACTIVE',
      trialEndsAt: daysAhead(365),
    },
  });
}

/**
 * The built-in roles.
 *
 * WHY replicate `listAccessRoles`' upsert rather than letting the app seed
 * them lazily: the app creates them the first time a screen asks for the role
 * list, which means until somebody opens that screen every member's
 * `memberRoleId` is null — and permissions resolved through AccessRole (the
 * ones that decide who may approve, who may see which documents) resolve to
 * nothing. Seeding them here means the org is complete before the camera runs.
 */
async function createAccessRoles(orgId: string): Promise<Map<string, string>> {
  const bySlug = new Map<string, string>();
  for (const role of BUILTIN_ROLES) {
    const created = await prisma.accessRole.upsert({
      where: { organizationId_slug: { organizationId: orgId, slug: role.slug } },
      update: {},
      create: {
        organizationId: orgId,
        name: role.name,
        slug: role.slug,
        description: role.description,
        color: role.color,
        scope: role.scope as never,
        isSystem: true,
        permissions: role.permissions as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, slug: true },
    });
    bySlug.set(created.slug, created.id);
  }

  /*
    One role this organisation built for itself.

    ⚠️ WHY IT EXISTS. Without it the crew carry `memberRoleId: null`, and their
    Access tab reads "this role grants no permissions yet" — under a narration
    saying a role is "a list of what they may do". The sentence and the screen
    contradicted each other, which is worse than either alone.

    It is also the more honest illustration: the built-in roles are ours, and
    the point of the beat is that an organisation writes its own. `isSystem`
    false, a name from this trade, and a modest set — an engineer can raise a
    follow-up job, see the clients they visit and keep their notes, and read the
    team's hours. Nothing about members, money or equipment.
  */
  const engineer = await prisma.accessRole.upsert({
    where: { organizationId_slug: { organizationId: orgId, slug: 'field-engineer' } },
    update: {},
    create: {
      organizationId: orgId,
      name: 'Field Engineer',
      slug: 'field-engineer',
      description: 'Works the jobs. Raises follow-up work and keeps the client record straight.',
      color: '#0ea5e9',
      scope: 'ORG',
      isSystem: false,
      permissions: {
        canCreateTasks: true,
        crmViewOwn: true,
        crmWork: true,
        canViewSpaceAttendance: true,
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  bySlug.set('field-engineer', engineer.id);

  return bySlug;
}

/** The org's default task flow. Without one the status pills have no labels. */
async function createWorkflow(orgId: string): Promise<string> {
  const template = DEFAULT_WORKFLOW_TEMPLATE;
  const workflow = await prisma.statusWorkflow.create({
    data: {
      organizationId: orgId,
      name: template.name,
      isDefault: true,
      isActive: true,
      statuses: {
        create: template.statuses.map((s) => ({
          name: s.name,
          key: s.key,
          color: s.color,
          icon: s.icon,
          position: s.position,
          isFinal: s.isFinal,
          isCanceled: s.isCanceled,
          transitions: s.transitions,
          // A String[] column, not JSON: the execution widgets (gps, timer,
          // photos) that light up at this step.
          capabilities: (s.capabilities ?? []) as string[],
        })),
      },
    },
    select: { id: true },
  });
  return workflow.id;
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Spaces
// ───────────────────────────────────────────────────────────────────────────

/**
 * Module keys every workspace here runs. `time_tracking` is the one the video
 * depends on — it gates clock-IN on the server, so a space without it refuses
 * the button the narration is describing.
 */
const SPACE_MODULES = [
  'subtasks',
  'checklists',
  'attachments',
  'tracking',
  'service_reports',
  'time_tracking',
  'assets',
  'crm',
] as const;

async function createSpaces(orgId: string, workflowId: string) {
  const depot = await prisma.companyLocation.create({
    data: {
      id: DEPOT.id,
      organizationId: orgId,
      name: DEPOT.name,
      address: DEPOT.address,
      lat: DEPOT.lat,
      lng: DEPOT.lng,
      geofenceRadius: DEPOT.geofenceRadius,
      timezone: ORG_TIMEZONE,
      kind: 'COMPANY',
      /*
        ⚠️ workModel NONE on purpose, and this is the one setting that decides
        whether the recording works.

        With SHIFT, clock-in resolves a rota, stamps an expected end onto the
        entry, and clocking out forty seconds later is "early" — which opens a
        dialog asking the member to explain themselves. That dialog is correct
        product behaviour and completely wrong for a two-minute video about
        the happy path. NONE means no rota is resolved, so clock-out is one
        click. The rota-driven story is its own video (see the shot list).
      */
      workModel: 'NONE',
      geofencePolicy: 'AWAY_ALLOWED',
      isDefault: true,
      isActive: true,
      minCover: 2,
      workflowId,
      enabledModules: [...SPACE_MODULES] as unknown as Prisma.InputJsonValue,
    },
  });

  const workshop = await prisma.companyLocation.create({
    data: {
      id: WORKSHOP.id,
      organizationId: orgId,
      name: WORKSHOP.name,
      address: WORKSHOP.address,
      lat: WORKSHOP.lat,
      lng: WORKSHOP.lng,
      geofenceRadius: WORKSHOP.geofenceRadius,
      timezone: ORG_TIMEZONE,
      kind: 'COMPANY',
      /*
        ⚠️ SHIFT here, NONE at the depot, and the split is load-bearing. The
        clocking videos need a workspace with no rota — with one, clocking out
        a minute later is "early" and opens a dialog asking the member to
        explain themselves. The counted-time, overtime and rota videos need the
        opposite: without an expected start and end there is nothing for the
        actual times to differ from, and their whole subject disappears.
      */
      workModel: 'SHIFT',
      geofencePolicy: 'AWAY_ALLOWED',
      isActive: true,
      minCover: 1,
      workflowId,
      enabledModules: [...SPACE_MODULES] as unknown as Prisma.InputJsonValue,
    },
  });

  const clientSite = await prisma.companyLocation.create({
    data: {
      id: CLIENT_SITE.id,
      organizationId: orgId,
      name: CLIENT_SITE.name,
      address: CLIENT_SITE.address,
      lat: CLIENT_SITE.lat,
      lng: CLIENT_SITE.lng,
      geofenceRadius: CLIENT_SITE.geofenceRadius,
      timezone: ORG_TIMEZONE,
      // A customer site is a workplace: people spend the day there and clock in there.
      kind: 'CUSTOMER',
      contactName: CLIENTS[0].contactName,
      contactEmail: CLIENTS[0].email,
      contactPhone: CLIENTS[0].phone,
      billableRateCents: 8500,
      workModel: 'NONE',
      geofencePolicy: 'AWAY_ALLOWED',
      isActive: true,
      workflowId,
      /*
        ⚠️ The client site also runs a PORTAL, which the other two do not: it
        is the workspace whose clients log in, and video 35 has no subject
        without it. `b2c_portal` is the module key; the Portal row itself is
        created below.
      */
      enabledModules: [...SPACE_MODULES, 'b2c_portal'] as unknown as Prisma.InputJsonValue,
    },
  });

  return { depot, workshop, clientSite };
}

// ───────────────────────────────────────────────────────────────────────────
// 4. People
// ───────────────────────────────────────────────────────────────────────────

/**
 * The access profile. ⚠️ `clock` in `modules` is what puts the Clock In button
 * on screen at all — a member without it is refused at a door well before any
 * attendance logic runs, and the screen simply has no button, which reads as
 * the feature being broken.
 */
function accessProfile(extra: Record<string, unknown> = {}) {
  return {
    modules: ['tasks', 'clock', 'time_off'],
    /*
      ⚠️ A STRING — 'both' | 'web' | 'mobile' — not an array.

      `canUsePlatform` compares it with `===`, so `['WEB','MOBILE']` (which
      looks entirely reasonable, and is how the modules field next to it is
      shaped) matches neither branch and FAILS CLOSED. The symptom is not an
      error at seed time: every request the recording makes comes back 403
      "Your account is set up for the mobile app", the web app bounces to the
      login page, and it reads as a broken session rather than a bad value.
    */
    platforms: 'both',
    ...extra,
  } as unknown as Prisma.InputJsonValue;
}

async function createPeople(orgId: string, roles: Map<string, string>, passwordHash: string) {
  const owner = await prisma.user.create({
    data: {
      email: OWNER.email,
      passwordHash,
      firstName: OWNER.firstName,
      lastName: OWNER.lastName,
      role: 'ADMIN',
      organizationId: orgId,
      onboardingCompleted: true,
      position: OWNER.position,
      timezone: ORG_TIMEZONE,
      memberRoleId: roles.get('admin') ?? null,
      canCreateTasks: true,
      taskCreationScope: 'ORG',
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: true,
      canViewReports: true,
      allowRemote: true,
      scheduleType: 'NONE',
      enabledModules: accessProfile(),
    },
  });

  // The org-owner invariant: an organisation with no owner renders oddly on
  // several admin screens.
  await prisma.organization.update({ where: { id: orgId }, data: { ownerId: owner.id } });

  /*
    The member the camera follows.

    EMPLOYEE, not ADMIN. An admin is granted every module unconditionally, so
    recording as one would prove nothing about whether the access profile
    actually puts the clock on screen — the video would work while the feature
    was broken for every real member. She holds `canViewAllTasks`, which is
    what opens the team attendance board, so one login covers both tours.
  */
  const lead = await prisma.user.create({
    data: {
      email: LEAD.email,
      passwordHash,
      firstName: LEAD.firstName,
      lastName: LEAD.lastName,
      role: 'EMPLOYEE',
      organizationId: orgId,
      onboardingCompleted: true,
      position: LEAD.position,
      timezone: ORG_TIMEZONE,
      /*
        ⚠️ canApproveOvertime / canViewSpaceAttendance / canReconcileAttendance
        are NOT columns on User — they exist only inside an AccessRole's
        permission set. Attaching the built-in `manager` role is what actually
        grants them; setting them here would have failed loudly, which is
        better than the alternative of a flag nothing reads.
      */
      memberRoleId: roles.get('manager') ?? null,
      canCreateTasks: true,
      taskCreationScope: 'ORG',
      canViewAllTasks: true,
      canAssignTasks: true,
      canViewReports: true,
      allowRemote: true,
      scheduleType: 'FIXED',
      monthlyHourBudget: 160,
      enabledModules: accessProfile(),
    },
  });

  /*
    The client's own facilities manager, invited in to follow the work.
    ⚠️ `isExternal` is the switch the whole thing hangs on — see the note on
    OUTSIDER in demo-data.ts. Their role is granted per SPACE, never org-wide.
  */
  const outsider = await prisma.user.create({
    data: {
      email: OUTSIDER.email,
      passwordHash,
      firstName: OUTSIDER.firstName,
      lastName: OUTSIDER.lastName,
      role: 'EMPLOYEE',
      organizationId: orgId,
      onboardingCompleted: true,
      position: OUTSIDER.position,
      timezone: ORG_TIMEZONE,
      isExternal: true,
      canCreateTasks: false,
      enabledModules: accessProfile(),
    },
    select: { id: true },
  });

  const crew: Record<string, { id: string; person: DemoPerson }> = {};
  for (const person of CREW) {
    const user = await prisma.user.create({
      data: {
        email: person.email,
        passwordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        role: 'EMPLOYEE',
        organizationId: orgId,
        onboardingCompleted: true,
        position: person.position,
        timezone: ORG_TIMEZONE,
        // The organisation's own role, not one of ours — see createAccessRoles.
        memberRoleId: roles.get('field-engineer') ?? null,
        canCreateTasks: false,
        taskCreationScope: 'NONE',
        scheduleType: 'FIXED',
        monthlyHourBudget: 160,
        allowRemote: person.key === 'achterberg',
        enabledModules: accessProfile(),
      },
      select: { id: true },
    });
    crew[person.key] = { id: user.id, person };
  }

  return { owner, lead, crew, outsider };
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Who works where
// ───────────────────────────────────────────────────────────────────────────

async function assignToSpaces(
  orgId: string,
  spaceIds: { depot: string; workshop: string; clientSite: string },
  leadId: string,
  ownerId: string,
  crew: Record<string, { id: string }>,
  roles: Map<string, string>,
  outsiderId?: string,
) {
  const assign = (userId: string, spaceId: string, isPrimary: boolean, roleId?: string | null) =>
    prisma.spaceAssignment.upsert({
      where: { userId_spaceId: { userId, spaceId } },
      update: { isPrimary, roleId: roleId ?? null },
      create: {
        organizationId: orgId,
        userId,
        spaceId,
        roleId: roleId ?? null,
        isPrimary,
        schedule: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        /*
          ⚠️ Back-dated. "Assigned right now" is a window check, and an
          assignment that starts at this instant can land a few milliseconds in
          the future — at which point the workspace is missing from the
          clock-in list and the button is disabled with no explanation.
        */
        effectiveFrom: daysAgo(90),
      },
    });

  /*
    ⚠️ Mara is assigned to the depot ONLY.

    With one workspace the app clocks straight in; with more than one it ranks
    them and may open a picker. The picker is a good feature and deserves its
    own video, but a dialog that appears on some runs and not others would put
    the narration out of step with the picture. One workspace, one outcome,
    every run.
  */
  await assign(leadId, spaceIds.depot, true, roles.get('space-manager'));
  /*
    ⚠️ The outsider is assigned to the CLIENT SITE only, with the built-in
    external role. One space, one role — an org-wide role is refused for an
    external member, because it would reach every workspace.
  */
  if (outsiderId) {
    await assign(outsiderId, spaceIds.clientSite, true, roles.get('external-observer'));
  }
  await assign(ownerId, spaceIds.depot, true, roles.get('space-manager'));

  const workshopCrew = new Set(['nakamura', 'whitlock']);
  for (const [key, member] of Object.entries(crew)) {
    const primary = workshopCrew.has(key) ? spaceIds.workshop : spaceIds.depot;
    await assign(member.id, primary, true, null);
    // Field engineers also work at the client site.
    if (!workshopCrew.has(key) && key !== 'achterberg') {
      await assign(member.id, spaceIds.clientSite, false, null);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Attendance history — what makes the team board look like a business
// ───────────────────────────────────────────────────────────────────────────

async function seedAttendance(
  orgId: string,
  spaceIds: { depot: string; workshop: string; clientSite: string },
  leadId: string,
  crew: Record<string, { id: string; person: DemoPerson }>,
) {
  /*
    ⚠️ Close anything still open across the WHOLE database, not just this org.

    An open shift belonging to any member refuses that member's next clock-in
    with "you are already clocked in". Mara is new every run so she is safe,
    but a developer's own half-finished shift in another org is the kind of
    thing that fails a render at the one step that cannot be retried cheaply.
    Closing only this org's rows is the conservative half; the rest is left
    alone deliberately, because clocking somebody else out is not ours to do.
  */
  const stillOpen = await prisma.timeEntry.updateMany({
    where: { organizationId: orgId, status: 'CLOCKED_IN' },
    data: {
      status: 'CLOCKED_OUT',
      clockOutAt: new Date(),
      reminderState: 'RESOLVED',
      nextRemindAt: null,
      nextBreakRemindAt: null,
    },
  });
  if (stillOpen.count) console.log(`  closed ${stillOpen.count} open shift(s) from a previous run`);

  /*
    ⚠️ The LEAD is in this list, not just the crew.

    The video's "Your recent hours" beat points at her own history, and the
    first cut seeded history for everybody except her — so the page said "No
    shifts between Sep 11 and Sep 17" while the narration described a month of
    them. The member the camera follows needs the same past as everybody else.
  */
  const members: Array<{ id: string; person: DemoPerson }> = [
    { id: leadId, person: LEAD },
    ...Object.values(crew),
  ];
  const entries: Prisma.TimeEntryCreateManyInput[] = [];
  const breaksFor: Array<{ index: number; startedAt: Date; minutes: number }> = [];

  // Four working weeks of history. Enough that the filters, the totals and the
  // export all have something to chew on, and the board never looks new.
  for (let daysBack = 28; daysBack >= 1; daysBack -= 1) {
    if (isWeekend(daysBack)) continue;

    for (const member of members) {
      const seed = `${member.person.key}-${daysBack}`;
      /*
        Not everybody works every day. ⚠️ Decided BEFORE anything is pushed:
        an earlier version appended the entry, recorded its break against the
        array index, and only then popped it — so the break's index pointed at
        whatever row landed there next, and some shifts ended up with two
        lunches while others had none. Deciding first is the only version where
        the two arrays cannot disagree.
      */
      if (jitter(`${seed}skip`, 11) === 0) continue;
      // A little spread around 07:30 so no two rows are identical.
      const inMinute = 15 + jitter(seed, 35);
      const clockIn = onDay(daysBack, 7, inMinute);
      const workedMinutes = 465 + jitter(`${seed}-out`, 70); // ~7h45m to ~8h55m
      const clockOut = new Date(clockIn.getTime() + workedMinutes * 60_000);
      const breakMinutes = 30;

      const spaceId =
        member.person.key === 'nakamura' || member.person.key === 'whitlock'
          ? spaceIds.workshop
          : spaceIds.depot;

      // A handful of flagged days, so the Approvals tab is not an empty state.
      const late = inMinute > 44;
      const long = workedMinutes > 520;
      const flagReasons = [
        ...(late ? ['LATE_ARRIVAL'] : []),
        ...(long ? ['OVERTIME'] : []),
      ];
      // Older flagged days have already been dealt with; this week's still wait.
      const settled = daysBack > 5;

      entries.push({
        userId: member.id,
        organizationId: orgId,
        locationId: spaceId,
        status: 'CLOCKED_OUT',
        timezone: ORG_TIMEZONE,
        clockInAt: clockIn,
        clockOutAt: clockOut,
        clockInLat: DEPOT.lat + (jitter(seed, 9) - 4) * 0.0002,
        clockInLng: DEPOT.lng + (jitter(`${seed}x`, 9) - 4) * 0.0002,
        clockInAccuracy: 6 + jitter(`${seed}a`, 14),
        clockOutLat: DEPOT.lat + (jitter(`${seed}o`, 9) - 4) * 0.0002,
        clockOutLng: DEPOT.lng + (jitter(`${seed}p`, 9) - 4) * 0.0002,
        clockOutAccuracy: 6 + jitter(`${seed}b`, 14),
        clockInWithinGeofence: true,
        clockOutWithinGeofence: true,
        totalMinutes: workedMinutes,
        breakMinutes,
        unpaidBreakMinutes: breakMinutes,
        /*
          The counted clocks. `clockInAt`/`clockOutAt` are evidence and are
          never adjusted; these are what payroll reads. With no rota on these
          spaces the counted window is simply the worked window, less the rest.
        */
        countedStartAt: clockIn,
        countedEndAt: clockOut,
        paidMinutes: workedMinutes - breakMinutes,
        flagReasons,
        approvalStatus: flagReasons.length === 0 ? 'AUTO' : settled ? 'APPROVED' : 'PENDING',
        approvedById: flagReasons.length > 0 && settled ? leadId : null,
        approvedAt: flagReasons.length > 0 && settled ? clockOut : null,
      });

      breaksFor.push({
        index: entries.length - 1,
        startedAt: new Date(clockIn.getTime() + 4 * 3_600_000 + jitter(`${seed}l`, 40) * 60_000),
        minutes: breakMinutes,
      });
    }
  }

  // createMany is the only way this stays fast — ~500 rows one at a time is
  // most of a minute, and the seed runs before every render.
  await prisma.timeEntry.createMany({ data: entries });

  /*
    Breaks need their entry's id, which createMany does not return. Reading
    them back and matching on (userId, clockInAt) is exact: a member cannot
    clock in twice at the same instant.
  */
  const created = await prisma.timeEntry.findMany({
    where: { organizationId: orgId },
    select: { id: true, userId: true, clockInAt: true },
  });
  const byKey = new Map(created.map((e) => [`${e.userId}@${e.clockInAt.toISOString()}`, e.id]));

  const breakRows: Prisma.BreakCreateManyInput[] = [];
  for (const b of breaksFor) {
    const entry = entries[b.index];
    if (!entry) continue;
    const id = byKey.get(`${entry.userId}@${(entry.clockInAt as Date).toISOString()}`);
    if (!id) continue;
    breakRows.push({
      timeEntryId: id,
      type: 'LUNCH',
      isPaid: false,
      startedAt: b.startedAt,
      endedAt: new Date(b.startedAt.getTime() + b.minutes * 60_000),
      durationMinutes: b.minutes,
    });
  }
  await prisma.break.createMany({ data: breakRows });

  /*
    Four people on the clock right now, so "who is active" on the team board
    reads as a live floor rather than an empty one. ⚠️ Mara is NOT one of them:
    the video's whole first act is her clocking in, and an open shift would
    meet her with "already clocked in".
  */
  // ⚠️ Crew only — never the lead. The video's first act is her clocking in,
  // and an open shift would meet her with "you are already clocked in".
  const live = Object.values(crew).slice(0, 4);
  for (const [i, member] of live.entries()) {
    const startedHoursAgo = 2 + i;
    await prisma.timeEntry.create({
      data: {
        userId: member.id,
        organizationId: orgId,
        locationId: i < 2 ? spaceIds.depot : spaceIds.clientSite,
        status: 'CLOCKED_IN',
        timezone: ORG_TIMEZONE,
        clockInAt: new Date(Date.now() - startedHoursAgo * 3_600_000),
        clockInLat: DEPOT.lat + 0.0001,
        clockInLng: DEPOT.lng + 0.0001,
        clockInAccuracy: 8,
        clockInWithinGeofence: true,
        breakMinutes: 0,
        flagReasons: [],
        approvalStatus: 'AUTO',
      },
    });
  }

  return { history: entries.length, live: live.length, breaks: breakRows.length };
}

/**
 * The road one member actually drove, and where everybody is now.
 *
 * ⚠️ WITHOUT THIS THERE IS NO ROUTE TO SHOW. The job screen mounts its route
 * section when the task has points or is on the way — with neither, it renders
 * "waiting for the technician", and a video about the road taken has a spinner
 * to narrate over.
 *
 * ⚠️ THE POINTS ARE A DRIVEN PATH, not a straight line between two pins. That
 * is the entire claim the feature makes, so a seed that laid down two points
 * would be proving the opposite of the sentence. These follow a plausible road
 * west out of Reading — invented, over open ground, like every other
 * coordinate here.
 */
async function seedRoute(
  taskIds: Map<string, string>,
  crew: Record<string, { id: string }>,
) {
  const taskId = taskIds.get('Cold room 2 — door seal replacement');
  const driverId = crew.rhodes?.id;
  if (!taskId || !driverId) return 0;

  /*
    A bend-by-bend path from the depot towards the client's site. Twenty-six
    points at roughly forty-second intervals is what a phone reports on a
    twenty-minute drive with distance-based sampling.
  */
  const path: Array<[number, number]> = [
    [51.42219, -0.95030], [51.42360, -0.94780], [51.42520, -0.94480], [51.42690, -0.94120],
    [51.42880, -0.93740], [51.43090, -0.93330], [51.43320, -0.92900], [51.43570, -0.92450],
    [51.43840, -0.91990], [51.44130, -0.91520], [51.44440, -0.91040], [51.44770, -0.90550],
    [51.45120, -0.90050], [51.45490, -0.89540], [51.45880, -0.89020], [51.46290, -0.88490],
    [51.46720, -0.87950], [51.47170, -0.87400], [51.47640, -0.86840], [51.48130, -0.86270],
    [51.48640, -0.85690], [51.49170, -0.85100], [51.49720, -0.84500], [51.50290, -0.83890],
    [51.50880, -0.83270], [51.51490, -0.82640],
  ];

  const startedAt = new Date(Date.now() - 24 * 60_000);
  for (const [i, [lat, lng]] of path.entries()) {
    await prisma.locationHistory.create({
      data: {
        userId: driverId,
        taskId,
        lat,
        lng,
        accuracy: 8 + (i % 5),
        timestamp: new Date(startedAt.getTime() + i * 42_000),
      },
    });
  }

  /* Haversine over the path, the same sum the server keeps as it arrives. */
  let metres = 0;
  for (let i = 1; i < path.length; i += 1) {
    const [aLat, aLng] = path[i - 1]!;
    const [bLat, bLng] = path[i]!;
    const R = 6_371_000;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    metres += 2 * R * Math.asin(Math.sqrt(h));
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { routeStartedAt: startedAt, routeDistance: Math.round(metres) },
  });

  /* And where everybody is now, so a member's pin is not a blank. */
  for (const [i, key] of ['rhodes', 'okafor', 'brennan', 'valdes'].entries()) {
    const userId = crew[key]?.id;
    if (!userId) continue;
    await prisma.workerLastLocation.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        lat: path[path.length - 1]![0] - i * 0.004,
        lng: path[path.length - 1]![1] + i * 0.006,
        accuracy: 10,
      },
    });
  }

  return path.length;
}

/**
 * A portal on the client's own site.
 *
 * ⚠️ WITHOUT THIS, `/portals` SAYS "No workspace has a client portal switched
 * on yet" and video 35 has nothing to film. The module key on the space is
 * only half of it — the Portal row is what the screen lists.
 */
async function seedPortal(orgId: string, spaceId: string, clientIds: Map<string, string>) {
  const portal = await prisma.portal.create({
    data: {
      id: PORTAL_ID,
      organizationId: orgId,
      spaceId,
      name: 'Brambleside Retail Park',
      templateKey: 'workplace',
      entityLabel: 'Unit',
      contactLabel: 'Facilities',
      accent: '#2563eb',
      isActive: true,
    },
    select: { id: true },
  });

  /* The client whose people log in. */
  const customerId = clientIds.get('Brambleside Retail Park');
  if (customerId) {
    await prisma.customer.update({ where: { id: customerId }, data: { portalId: portal.id } });
  }
  return 1;
}

/**
 * The personnel file: two types, and licences at every stage of running out.
 *
 * ⚠️ NO FILE EXISTS BEHIND THESE ROWS. `storageKey` names an object in the
 * bucket that was never uploaded, because a seed must not put demo files in a
 * real object store. Everything that READS the register — the credential
 * board, the counts, a member's own list — works; anything that OPENS a
 * document would not. No video does.
 *
 * ⚠️ `visibleToRoleIds` IS LEFT EMPTY, which means NO RESTRICTION rather than
 * "nobody". The opposite default would empty every register in the
 * organisation, which is the bug this field was shipped carefully to avoid.
 */
async function seedDocuments(
  orgId: string,
  crew: Record<string, { id: string }>,
  ownerId: string,
) {
  const licence = await prisma.documentType.create({
    data: {
      organizationId: orgId,
      key: 'driving-licence',
      label: 'Driving licence',
      description: 'Only they have it, so they upload it. Expires, and gates driving work.',
      direction: 'SUPPLIED',
      cadence: 'ONE_OFF',
      isCredential: true,
      hasExpiry: true,
      requiredFromAll: true,
      signatureMode: 'NONE',
      visibleToRoleIds: [],
      isActive: true,
    },
    select: { id: true },
  });

  const payslip = await prisma.documentType.create({
    data: {
      organizationId: orgId,
      key: 'payslip',
      label: 'Payslip',
      description: 'One per month, per person.',
      direction: 'ISSUED',
      cadence: 'MONTHLY',
      signatureMode: 'NONE',
      visibleToRoleIds: [],
      isActive: true,
    },
    select: { id: true },
  });

  const onDate = (days: number) =>
    new Date(new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10));

  /* Every stage of running out, so the board has something in each column. */
  const licences: Array<[string, number]> = [
    ['rhodes', 640],
    ['okafor', 51],
    ['brennan', 19],
    ['devlin', -12],
  ];
  let made = 0;
  for (const [key, days] of licences) {
    const userId = crew[key]?.id;
    if (!userId) continue;
    await prisma.document.create({
      data: {
        organizationId: orgId,
        userId,
        typeId: licence.id,
        title: 'Driving licence',
        storageKey: `seed/video/licence-${key}.pdf`,
        sha256: `seed-${key}`,
        sizeBytes: 148_000,
        mimeType: 'application/pdf',
        status: days < 0 ? 'EXPIRED' : 'ISSUED',
        issuedById: userId,
        issuedAt: daysAgo(400),
        expiresOn: onDate(days),
        verifiedAt: daysAgo(395),
        verifiedById: ownerId,
      },
    });
    made += 1;
  }

  /* A month of payslips for two people, so the issued register is not empty. */
  const now = new Date();
  for (const key of ['rhodes', 'okafor']) {
    const userId = crew[key]?.id;
    if (!userId) continue;
    for (let back = 1; back <= 3; back += 1) {
      const when = new Date(now.getFullYear(), now.getMonth() - back, 28);
      await prisma.document.create({
        data: {
          organizationId: orgId,
          userId,
          typeId: payslip.id,
          title: `Payslip — ${when.toLocaleString('en-GB', { month: 'long' })} ${when.getFullYear()}`,
          periodYear: when.getFullYear(),
          periodMonth: when.getMonth() + 1,
          storageKey: `seed/video/payslip-${key}-${back}.pdf`,
          sha256: `seed-${key}-${back}`,
          sizeBytes: 92_000,
          mimeType: 'application/pdf',
          status: 'ISSUED',
          issuedById: ownerId,
          issuedAt: when,
        },
      });
      made += 1;
    }
  }

  return made;
}

/**
 * The rota, and the two clocks.
 *
 * ⚠️ THE WORKSHOP RUNS ON SHIFTS AND THE DEPOT DOES NOT, and that split is
 * load-bearing. Videos about clocking in need a workspace with no rota, or
 * clocking out forty seconds later is "early" and opens a dialog asking the
 * member to explain themselves. Videos about counted time need the opposite:
 * without an expected start and end there is nothing for the actual times to
 * differ FROM, and the whole subject disappears.
 *
 * ⚠️ COUNTED TIME IS COMPUTED HERE THE SAME WAY THE PRODUCT COMPUTES IT —
 * max(clock-in, shift start) to min(clock-out, shift end), less the unpaid
 * rest. Inventing the numbers instead would put a screen on camera whose
 * arithmetic does not work, which is worse than no screen at all.
 */
async function seedRota(
  orgId: string,
  spaceId: string,
  crew: Record<string, { id: string }>,
  leadId: string,
) {
  const shift = await prisma.shift.create({
    data: {
      organizationId: orgId,
      spaceId,
      name: 'Workshop early',
      description: 'Bench work, 07:00 to 15:30, half an hour off at noon.',
      color: '#2563eb',
      startLocal: '07:00',
      endLocal: '15:30',
      crossesMidnight: false,
      breakMinutes: 30,
      flagToleranceMin: 10,
      isActive: true,
    },
    select: { id: true },
  });

  const onShift = ['nakamura', 'whitlock'].map((k) => crew[k]?.id).filter(Boolean) as string[];
  for (const userId of onShift) {
    await prisma.shiftAssignment.create({
      data: {
        organizationId: orgId,
        userId,
        spaceId,
        shiftId: shift.id,
        recurrence: 'WEEKLY',
        daysOfWeek: [1, 2, 3, 4, 5],
        effectiveFrom: daysAgo(60),
        isActive: true,
        createdById: leadId,
      },
    });
  }

  /*
    Four days each, with the differences that make the two clocks visible:
    somebody in early (the extra minutes are not counted), somebody away late
    (counted to the shift's end, and the rest is an overtime question), and two
    ordinary days so the ordinary case is the common one on screen.
  */
  const days: Array<{ back: number; inMin: number; outMin: number; flags: string[] }> = [
    { back: 1, inMin: -23, outMin: 22, flags: ['EARLY_ARRIVAL', 'OVERTIME'] },
    { back: 2, inMin: 14, outMin: 0, flags: ['LATE_ARRIVAL'] },
    { back: 3, inMin: -4, outMin: 3, flags: [] },
    { back: 4, inMin: 2, outMin: -1, flags: [] },
  ];

  let entries = 0;
  let overtimeEntryId: string | null = null;
  for (const userId of onShift) {
    for (const day of days) {
      const expectedIn = onDay(day.back, 7, 0);
      const expectedOut = onDay(day.back, 15, 30);
      const clockIn = new Date(expectedIn.getTime() + day.inMin * 60_000);
      const clockOut = new Date(expectedOut.getTime() + day.outMin * 60_000);
      // The product's own rule, not a number typed in by hand.
      const countedStart = new Date(Math.max(clockIn.getTime(), expectedIn.getTime()));
      const countedEnd = new Date(Math.min(clockOut.getTime(), expectedOut.getTime()));
      const paidMinutes = Math.max(
        0,
        Math.round((countedEnd.getTime() - countedStart.getTime()) / 60_000) - 30,
      );

      const entry = await prisma.timeEntry.create({
        data: {
          organizationId: orgId,
          userId,
          locationId: spaceId,
          shiftId: shift.id,
          status: 'CLOCKED_OUT',
          timezone: ORG_TIMEZONE,
          clockInAt: clockIn,
          clockInLat: WORKSHOP.lat,
          clockInLng: WORKSHOP.lng,
          clockInAccuracy: 9,
          clockInWithinGeofence: true,
          clockOutAt: clockOut,
          clockOutLat: WORKSHOP.lat,
          clockOutLng: WORKSHOP.lng,
          clockOutWithinGeofence: true,
          expectedClockInAt: expectedIn,
          expectedClockOutAt: expectedOut,
          countedStartAt: countedStart,
          countedEndAt: countedEnd,
          paidMinutes,
          breakMinutes: 30,
          flagReasons: day.flags,
          approvalStatus: day.flags.length ? 'PENDING' : 'AUTO',
        },
        select: { id: true },
      });
      entries += 1;
      if (day.flags.includes('OVERTIME') && !overtimeEntryId) overtimeEntryId = entry.id;
    }
  }

  /*
    One round of overtime waiting on somebody.

    ⚠️ `timeEntryId` is NOT unique any more — a shift can go round more than
    once — so this is one row of a conversation, not the whole of it.
  */
  if (overtimeEntryId) {
    await prisma.overtimeRequest.create({
      data: {
        organizationId: orgId,
        technicianId: onShift[0]!,
        timeEntryId: overtimeEntryId,
        locationId: spaceId,
        cycle: 1,
        status: 'PENDING_APPROVAL',
        technicianRespondedAt: daysAgo(1),
        technicianReason: 'Rebuilding the pump seal — twenty minutes short of finishing it.',
      },
    });
  }

  return { shift: 1, assignments: onShift.length, entries };
}

/**
 * Leave, in every state a wallchart needs to show one.
 *
 * ⚠️ `startDate`/`endDate` are DATE columns. A timestamp with an hour in it
 * lands on the wrong day at either edge of the year, which is the class of bug
 * that makes a day off appear on the wallchart a day late.
 */
async function seedTimeOff(crew: Record<string, { id: string }>, leadId: string) {
  const onDate = (d: number) => new Date(new Date(Date.now() + d * DAY_MS).toISOString().slice(0, 10));
  const rows: Array<[string, number, number, string, string, string]> = [
    ['rhodes', 12, 16, 'VACATION', 'APPROVED', 'Family holiday, booked in March.'],
    ['okafor', 5, 5, 'VACATION', 'PENDING', 'Moving house.'],
    ['brennan', -9, -9, 'SICK', 'APPROVED', ''],
    ['valdes', 26, 33, 'VACATION', 'PENDING', 'Two weeks, back on the Monday.'],
  ];
  let made = 0;
  for (const [key, from, to, type, status, reason] of rows) {
    const technicianId = crew[key]?.id;
    if (!technicianId) continue;
    await prisma.timeOff.create({
      data: {
        technicianId,
        startDate: onDate(from),
        endDate: onDate(to),
        type: type as never,
        status: status as never,
        reason: reason || null,
        approvedById: status === 'APPROVED' ? leadId : null,
        approvedAt: status === 'APPROVED' ? daysAgo(20) : null,
      },
    });
    made += 1;
  }
  return made;
}

// ───────────────────────────────────────────────────────────────────────────
// 7. Clients, jobs, assets, invoices — so no screen is an empty state
// ───────────────────────────────────────────────────────────────────────────

async function seedClients(orgId: string, spaceId: string, ownerId: string) {
  const ids = new Map<string, string>();
  for (const [i, client] of CLIENTS.entries()) {
    const row = await prisma.customer.create({
      data: {
        organizationId: orgId,
        // ⚠️ A client with no spaceId is invisible in every workspace tab and
        // outside the per-space CRM — it looks like the record was not saved.
        spaceId,
        name: client.name,
        type: 'COMPANY',
        status: i < 4 ? 'CUSTOMER' : 'QUALIFIED',
        contactName: client.contactName,
        email: client.email,
        phone: client.phone,
        address: client.address,
        industry: client.industry,
        ownerId,
        isActive: true,
      },
      select: { id: true },
    });
    ids.set(client.name, row.id);
  }
  return ids;
}

async function seedTasks(
  orgId: string,
  spaceId: string,
  workflowId: string,
  creatorId: string,
  crew: Record<string, { id: string }>,
  clientIds: Map<string, string>,
) {
  const ids = new Map<string, string>();
  for (const task of TASKS) {
    const row = await prisma.task.create({
      data: {
        organizationId: orgId,
        spaceId,
        workflowId,
        createdById: creatorId,
        assignedToId: crew[task.assignee]?.id ?? null,
        customerId: clientIds.get(task.client) ?? null,
        title: task.title,
        description: task.description,
        // ⚠️ A plain string, not the legacy TaskStatus enum: the column holds
        // whatever key the space's workflow defines.
        status: task.status,
        priority: task.priority as never,
        dueDate: task.dueInDays >= 0 ? daysAhead(task.dueInDays) : daysAgo(-task.dueInDays),
        locationAddress: CLIENTS.find((c) => c.name === task.client)?.address ?? null,
      },
      select: { id: true },
    });
    ids.set(task.title, row.id);
  }
  return ids;
}

/**
 * One job carried all the way through, so the "open one and it is the whole
 * story" beat is true of the job the camera actually opens.
 *
 * ⚠️ WHY ONLY ONE. Fourteen jobs each carrying a timeline, a conversation and
 * a signed report is a seed that takes minutes and a board where nothing stands
 * out. The video opens ONE job; that one is furnished, the rest stay as they
 * are — which is also what a real board looks like, where most jobs are half
 * done and a few are finished.
 *
 * ⚠️ The narration names the parts, the hours and the signature. If this
 * function is ever removed, beat `theJobHolds` becomes a sentence describing
 * things that are not on screen — which is the exact bug the first render of
 * the old attendance video shipped with.
 */
const STORY_JOB = 'Replace failed extract fan — kitchen';

/** Ink on transparent, drawn as a path so no image file has to ship. */
function signature(strokes: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 90">` +
    `<path d="${strokes}" fill="none" stroke="#111827" stroke-width="2.4" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function seedOneJobInFull(
  orgId: string,
  taskIds: Map<string, string>,
  crew: Record<string, { id: string }>,
  leadId: string,
  clientIds: Map<string, string>,
) {
  const taskId = taskIds.get(STORY_JOB);
  const engineer = crew.devlin?.id;
  if (!taskId || !engineer) return 0;

  /*
    The timeline the Activity panel renders. Written in the order they happened
    and dated backwards from the visit, because the panel sorts by time and a
    job whose events all share one timestamp reads as an import, not as work.
  */
  const events: Array<[string, string, Date, Record<string, unknown>]> = [
    ['CREATED', leadId, daysAgo(3), { title: STORY_JOB }],
    ['ASSIGNED', leadId, daysAgo(3), { assignedTo: 'Conor Devlin' }],
    ['STATUS_CHANGED', engineer, daysAgo(2), { from: 'ASSIGNED', to: 'ACCEPTED' }],
    ['STATUS_CHANGED', engineer, daysAgo(1), { from: 'ACCEPTED', to: 'EN_ROUTE' }],
    ['STATUS_CHANGED', engineer, daysAgo(1), { from: 'EN_ROUTE', to: 'ARRIVED' }],
    ['STATUS_CHANGED', engineer, daysAgo(1), { from: 'ARRIVED', to: 'IN_PROGRESS' }],
    ['COMMENT_ADDED', engineer, daysAgo(1), {}],
    ['STATUS_CHANGED', engineer, daysAgo(1), { from: 'IN_PROGRESS', to: 'COMPLETED' }],
  ];
  for (const [eventType, userId, createdAt, metadata] of events) {
    await prisma.taskEvent.create({
      data: { taskId, userId, eventType: eventType as never, metadata: metadata as never, createdAt },
    });
  }

  const comments: Array<[string, string, Date]> = [
    [leadId, 'Kitchen closes at 15:00 — the manager will let you in through the yard door.', daysAgo(2)],
    [engineer, 'Motor is seized solid, not the capacitor. Fitting the 400mm from the van.', daysAgo(1)],
    [engineer, 'Running and balanced. Chef signed it off before I left.', daysAgo(1)],
  ];
  for (const [userId, content, createdAt] of comments) {
    await prisma.comment.create({ data: { taskId, userId, content, createdAt } });
  }

  const report = await prisma.serviceReport.create({
    data: {
      organizationId: orgId,
      taskId,
      customerId: clientIds.get('Pilgrove Hotels') ?? null,
      summary: 'Seized extract fan replaced and commissioned.',
      workPerformed:
        'Isolated and locked off the supply. Removed the failed 400mm inline unit — bearings seized, ' +
        'windings discoloured. Fitted the replacement, re-made the flexible connections and re-sealed ' +
        'the duct. Ran up, checked current draw against the plate and balanced against the make-up air. ' +
        'Left the isolator labelled and the old unit in the van for disposal.',
      workDuration: 2 * 3600 + 40 * 60,
      completedAt: daysAgo(1),
      completedById: engineer,
      customerName: 'H. Oduya — Head Chef',
      technicianSignature: signature('M12 62 C 34 22, 52 74, 74 40 S 104 20, 122 56 S 150 70, 170 38'),
      customerSignature: signature('M16 58 C 40 30, 58 68, 84 44 C 106 24, 118 66, 146 42 L 196 54'),
    },
    select: { id: true },
  });

  const parts = [
    { name: 'Inline extract fan, 400mm', partNumber: 'TD-1300/400', quantity: 1, unitCost: 214.5 },
    { name: 'Flexible duct connector, 400mm', partNumber: 'FDC-400', quantity: 2, unitCost: 11.4 },
    { name: 'Duct sealant, 310ml', partNumber: 'DS-310', quantity: 1, unitCost: 6.95 },
  ];
  for (const part of parts) {
    await prisma.partUsed.create({ data: { reportId: report.id, ...part } });
  }

  return events.length + comments.length + parts.length + 1;
}

async function seedAssets(
  orgId: string,
  spaceId: string,
  crew: Record<string, { id: string }>,
) {
  const vehicles = await prisma.assetCategory.create({
    data: {
      organizationId: orgId,
      spaceId,
      name: 'Vehicles',
      description: 'The van fleet, and what each one costs to run',
      config: {
        nameLabel: 'Vehicle',
        hasAddress: false,
        holder: { enabled: true, label: 'Driver', members: true, clients: false },
        fields: [{ label: 'Registration' }, { label: 'Make' }, { label: 'Model' }, { label: 'Year' }],
        allowExtraFields: true,
        money: {
          enabled: true,
          categories: [
            { label: 'Fuel', direction: 'out' },
            { label: 'Servicing', direction: 'out' },
            { label: 'Insurance', direction: 'out' },
            { label: 'Repairs', direction: 'out' },
          ],
        },
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  const equipment = await prisma.assetCategory.create({
    data: {
      organizationId: orgId,
      spaceId,
      name: 'Test equipment',
      description: 'Calibrated instruments, and who is holding each one',
      config: {
        nameLabel: 'Instrument',
        hasAddress: false,
        holder: { enabled: true, label: 'Held by', members: true, clients: false },
        fields: [{ label: 'Serial' }, { label: 'Make' }, { label: 'Model' }, { label: 'Calibrated' }],
        allowExtraFields: true,
        money: { enabled: true, categories: [{ label: 'Calibration', direction: 'out' }] },
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  let count = 0;
  for (const van of VEHICLES) {
    const holderId = crew[van.holder]?.id ?? null;
    const asset = await prisma.asset.create({
      data: {
        organizationId: orgId,
        categoryId: vehicles.id,
        name: van.name,
        serialNumber: van.registration,
        holderUserId: holderId,
        status: 'ACTIVE',
        details: [
          { label: 'Registration', value: van.registration },
          { label: 'Make', value: van.make },
          { label: 'Model', value: van.model },
          { label: 'Year', value: van.year },
        ] as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    count += 1;

    /*
      ⚠️ Custody is written as a PERIOD as well as a holder pointer. The two
      tables always move together — a holder row with no open period reads as
      "held by nobody" on every custody screen, and the van's whole cost
      ledger then attributes to nobody with it.
    */
    if (holderId) {
      await prisma.assetHolder.create({
        data: { assetId: asset.id, userId: holderId },
      });
      await prisma.assetCustody.create({
        data: {
          organizationId: orgId,
          assetId: asset.id,
          userId: holderId,
          startedAt: daysAgo(120),
        },
      });
    }

    // A little running cost, so the Money tab is not blank.
    await prisma.assetMoney.createMany({
      data: [0, 9, 18, 27].map((d, i) => ({
        organizationId: orgId,
        assetId: asset.id,
        category: i === 1 ? 'Servicing' : 'Fuel',
        direction: 'OUT' as const,
        amountCents: i === 1 ? 28_400 : 6_200 + jitter(`${van.registration}${d}`, 3_000),
        note: i === 1 ? 'Interim service' : 'Diesel',
        occurredAt: daysAgo(d + 1),
        authorId: holderId,
        status: 'RECORDED' as const,
      })),
    });
  }

  for (const tool of TOOLS) {
    const holderId = crew[tool.holder]?.id ?? null;
    const asset = await prisma.asset.create({
      data: {
        organizationId: orgId,
        categoryId: equipment.id,
        name: tool.name,
        serialNumber: tool.serial,
        holderUserId: holderId,
        status: 'ACTIVE',
        details: [
          { label: 'Serial', value: tool.serial },
          { label: 'Make', value: tool.make },
          { label: 'Model', value: tool.model },
          { label: 'Calibrated', value: 'March 2026' },
        ] as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    count += 1;
    if (holderId) {
      await prisma.assetHolder.create({
        data: { assetId: asset.id, userId: holderId },
      });
      await prisma.assetCustody.create({
        data: { organizationId: orgId, assetId: asset.id, userId: holderId, startedAt: daysAgo(60) },
      });
    }
  }

  return count;
}

async function seedInvoices(orgId: string, spaceId: string, creatorId: string) {
  const rows = [
    { client: 0, total: 1_284.0, status: 'PAID', issued: 38, due: 8, desc: 'Quarterly HVAC maintenance — Q1' },
    { client: 1, total: 742.5, status: 'PAID', issued: 31, due: 1, desc: 'Loading bay door repairs' },
    { client: 2, total: 2_150.0, status: 'SENT', issued: 12, due: -18, desc: 'Emergency lighting — annual test and certification' },
    { client: 3, total: 468.0, status: 'SENT', issued: 9, due: -21, desc: 'Kitchen extract fan replacement' },
    { client: 4, total: 3_420.0, status: 'OVERDUE', issued: 52, due: 22, desc: 'Cold room refurbishment — phase 1' },
    { client: 5, total: 895.0, status: 'DRAFT', issued: 1, due: -29, desc: 'Fire damper inspection — floors 1-3' },
  ] as const;

  for (const [i, row] of rows.entries()) {
    const client = CLIENTS[row.client];
    const subtotal = Math.round((row.total / 1.2) * 100) / 100;
    const taxAmount = Math.round((row.total - subtotal) * 100) / 100;
    await prisma.invoice.create({
      data: {
        organizationId: orgId,
        spaceId,
        createdById: creatorId,
        invoiceNumber: `HF-2026-${String(1041 + i).padStart(4, '0')}`,
        status: row.status as never,
        clientName: client.name,
        clientEmail: client.email,
        clientAddress: client.address,
        subtotal,
        taxRate: 0.2,
        taxAmount,
        discount: 0,
        total: row.total,
        currency: ORG_CURRENCY,
        issueDate: daysAgo(row.issued),
        dueDate: row.due >= 0 ? daysAgo(row.due) : daysAhead(-row.due),
        // ⚠️ Only a PAID invoice carries a payment date. A date on an unpaid
        // row is how a screen ends up claiming money nobody has received.
        paidAt: row.status === 'PAID' ? daysAgo(Math.max(0, row.due - 2)) : null,
        items: {
          create: [{ description: row.desc, quantity: 1, unitPrice: subtotal, amount: subtotal }],
        },
      },
    });
  }
  return rows.length;
}

// ───────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nBuilding the recording stage: "${VIDEO_ORG_NAME}"\n`);

  await destroyPreviousRun();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const org = await createOrganization();
  console.log(`  organization ${org.id}`);

  const roles = await createAccessRoles(org.id);
  const workflowId = await createWorkflow(org.id);
  const spaces = await createSpaces(org.id, workflowId);
  const spaceIds = {
    depot: spaces.depot.id,
    workshop: spaces.workshop.id,
    clientSite: spaces.clientSite.id,
  };

  const { owner, lead, crew, outsider } = await createPeople(org.id, roles, passwordHash);
  await assignToSpaces(org.id, spaceIds, lead.id, owner.id, crew, roles, outsider.id);
  console.log(`  ${Object.keys(crew).length + 2} members across 3 workspaces`);

  const attendance = await seedAttendance(org.id, spaceIds, lead.id, crew);
  console.log(
    `  ${attendance.history} shifts of history, ${attendance.breaks} breaks, ${attendance.live} on the clock now`,
  );

  const documents = await seedDocuments(org.id, crew, owner.id);
  const rota = await seedRota(org.id, spaceIds.workshop, crew, lead.id);
  const leave = await seedTimeOff(crew, lead.id);
  console.log(
    `  a rota on the workshop: ${rota.assignments} on shift, ${rota.entries} shifts with counted hours, ${leave} leave requests`,
  );
  console.log(`  ${documents} documents on file`);

  const clientIds = await seedClients(org.id, spaceIds.depot, lead.id);
  // ⚠️ After the clients: the portal attaches itself to one of them.
  const portals = await seedPortal(org.id, spaceIds.clientSite, clientIds);
  const taskIds = await seedTasks(org.id, spaceIds.depot, workflowId, lead.id, crew, clientIds);
  const storyRows = await seedOneJobInFull(org.id, taskIds, crew, lead.id, clientIds);
  const routePoints = await seedRoute(taskIds, crew);
  const assetCount = await seedAssets(org.id, spaceIds.depot, crew);
  const invoiceCount = await seedInvoices(org.id, spaceIds.clientSite, owner.id);
  console.log(
    `  ${clientIds.size} clients, ${taskIds.size} jobs, ${assetCount} assets, ${invoiceCount} invoices, ${portals} client portal`,
  );
  console.log(`  ${storyRows} rows furnishing "${STORY_JOB}" — the job video 01 opens`);
  console.log(`  ${routePoints} GPS points on one job — the road actually driven`);

  console.log('\n  Recording account');
  console.log(`    ${LEAD.email}`);
  console.log(`    ${DEMO_PASSWORD}`);
  console.log(`    ${LEAD.firstName} ${LEAD.lastName} — ${LEAD.position}`);
  console.log(`\n  Everyone in this organisation is invented. Nothing here is a real person.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
