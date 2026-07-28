/**
 * Seed rich Schedule + Time-Off data for every EMPLOYEE (both demo orgs).
 * Idempotent: wipes existing schedules/time-off for those employees first.
 * Run:  npx tsx prisma/seed-schedule-timeoff.ts   (from apps/api/auth-service)
 */
import { PrismaClient, TimeOffStatus } from '@prisma/client';

const p = new PrismaClient();

// date-only helper (noon UTC to avoid TZ off-by-one on @db.Date)
const dayMs = 86_400_000;
const today = new Date();
const T0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12);
const d = (offsetDays: number) => new Date(T0 + offsetDays * dayMs);

// ---- weekly schedule templates (dayOfWeek 0=Sun..6=Sat) ----
type Slot = { day: number; start: string; end: string; note?: string; active?: boolean };
const TEMPLATES: Slot[][] = [
  // A: standard full-time
  [1, 2, 3, 4, 5].map((day) => ({ day, start: '08:00', end: '17:00' })),
  // B: early shift, Wednesday remote
  [1, 2, 3, 4, 5].map((day) => ({ day, start: '07:00', end: '15:30', note: day === 3 ? 'Remote day' : undefined })),
  // C: Tue–Sat late shift
  [2, 3, 4, 5, 6].map((day) => ({ day, start: '10:00', end: '18:00' })),
  // D: part-time Mon/Wed/Fri
  [1, 3, 5].map((day) => ({ day, start: '09:00', end: '13:00', note: 'Part-time' })),
  // E: 4-day compressed, Friday off
  [1, 2, 3, 4].map((day) => ({ day, start: '07:30', end: '17:30' })),
  // F: full-time + on-call Saturday
  [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '08:30', end: '16:30', note: day === 6 ? 'On-call' : undefined, active: day === 6 ? true : true })),
];

// ---- time-off variety ----
const VACATION = 'Vacation';
const REASONS_APPROVED = ['Vacation', 'Sick leave', 'Public holiday', 'Training', 'Medical appointment'];
const REASONS_PENDING = ['Vacation', 'Personal', 'Parental leave', 'Family event', 'Conference'];
const REJECT_REASONS = ['Coverage unavailable that week', 'Overlaps with a scheduled project', 'Team already at min. staffing'];

// deterministic per-index jitter
const jit = (i: number, mod: number, add = 0) => ((i * 37 + add) % mod);

async function pickApprover(orgId: string): Promise<string | null> {
  const admin = await p.user.findFirst({ where: { organizationId: orgId, role: 'ADMIN' }, select: { id: true } });
  if (admin) return admin.id;
  const mgr = await p.user.findFirst({ where: { organizationId: orgId, canManageUsers: true }, select: { id: true } });
  return mgr?.id ?? null;
}

async function main() {
  const emps = await p.user.findMany({ where: { role: 'EMPLOYEE' }, select: { id: true, firstName: true, lastName: true, organizationId: true } });
  console.log(`Seeding schedule + time-off for ${emps.length} employees...`);

  // wipe existing for these employees
  const ids = emps.map((e) => e.id);
  await p.timeOff.deleteMany({ where: { technicianId: { in: ids } } });
  await p.technicianSchedule.deleteMany({ where: { technicianId: { in: ids } } });

  const approverCache = new Map<string, string | null>();
  let schedCount = 0;
  let toCount = 0;

  for (let i = 0; i < emps.length; i++) {
    const e = emps[i];
    if (!e.organizationId) continue;
    if (!approverCache.has(e.organizationId)) approverCache.set(e.organizationId, await pickApprover(e.organizationId));
    const approverId = approverCache.get(e.organizationId) ?? null;

    // --- weekly schedule ---
    const tpl = TEMPLATES[i % TEMPLATES.length];
    for (const s of tpl) {
      await p.technicianSchedule.create({
        data: {
          technicianId: e.id,
          dayOfWeek: s.day,
          startTime: s.start,
          endTime: s.end,
          isActive: s.active ?? true,
          notes: s.note ?? null,
        },
      });
      schedCount++;
    }

    // --- time-off requests (5–7 per employee, mixed status & dates) ---
    const entries: { start: number; len: number; reason: string; status: TimeOffStatus }[] = [
      // past approved vacation
      { start: -70 - jit(i, 20), len: 5 + jit(i, 6), reason: 'Vacation', status: 'APPROVED' },
      // recent approved sick day(s)
      { start: -25 - jit(i, 10, 3), len: 1 + jit(i, 3), reason: REASONS_APPROVED[jit(i, REASONS_APPROVED.length, 1)], status: 'APPROVED' },
      // pending upcoming vacation
      { start: 18 + jit(i, 25), len: 4 + jit(i, 8), reason: REASONS_PENDING[jit(i, REASONS_PENDING.length)], status: 'PENDING' },
      // pending single personal day
      { start: 7 + jit(i, 12, 2), len: 1, reason: 'Personal', status: 'PENDING' },
      // rejected request (past)
      { start: -18 - jit(i, 8, 4), len: 2 + jit(i, 4), reason: 'Vacation', status: 'REJECTED' },
      // canceled future request
      { start: 40 + jit(i, 30, 5), len: 3 + jit(i, 5), reason: REASONS_PENDING[jit(i, REASONS_PENDING.length, 2)], status: 'CANCELED' },
    ];
    // some employees get an extra long approved leave (variety)
    if (i % 3 === 0) entries.push({ start: 60 + jit(i, 20), len: 10 + jit(i, 8), reason: 'Parental leave', status: 'APPROVED' });

    for (let k = 0; k < entries.length; k++) {
      const en = entries[k];
      const isDecided = en.status === 'APPROVED' || en.status === 'REJECTED';
      await p.timeOff.create({
        data: {
          technicianId: e.id,
          startDate: d(en.start),
          endDate: d(en.start + en.len - 1),
          reason: en.reason,
          status: en.status,
          approvedById: isDecided ? approverId : null,
          approvedAt: isDecided ? d(en.start - 5) : null,
          rejectionReason: en.status === 'REJECTED' ? REJECT_REASONS[jit(i + k, REJECT_REASONS.length)] : null,
        },
      });
      toCount++;
    }
  }

  console.log(`Done. Created ${schedCount} schedule slots and ${toCount} time-off requests.`);
  const byStatus = await p.timeOff.groupBy({ by: ['status'], _count: true });
  console.log('Time-off by status:', byStatus.map((s) => `${s.status}=${s._count}`).join('  '));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
