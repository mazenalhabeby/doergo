import { personName, safeSignatureDataUrl } from '@hbcfield/shared';

const DAY = 86_400_000;

/** A period is at most this long — the page offers a week or a month. */
const MAX_PERIOD_DAYS = 93;

/** Rounds read for one summary; a period with more is summarised from the newest. */
const SUMMARY_CAP = 5000;

const PERSON = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } as const;

const ROUND_SELECT = {
  id: true,
  cycle: true,
  status: true,
  technicianId: true,
  timeEntryId: true,
  createdAt: true,
  technicianRespondedAt: true,
  technicianReason: true,
  approvalMethod: true,
  approvedAt: true,
  leaderName: true,
  approverNotes: true,
  rejectionReason: true,
  maxDurationMinutes: true,
  overtimeStartAt: true,
  overtimeEndAt: true,
  actualEndAt: true,
  overtimeMinutes: true,
  technician: PERSON,
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  location: { select: { id: true, name: true, timezone: true } },
  timeEntry: { select: { clockInAt: true, clockOutAt: true } },
} as const;

type RoundRow = {
  id: string;
  cycle: number;
  status: string;
  technicianId: string;
  timeEntryId: string;
  createdAt: Date;
  technicianRespondedAt: Date | null;
  technicianReason: string | null;
  approvalMethod: string | null;
  approvedAt: Date | null;
  leaderName: string | null;
  approverNotes: string | null;
  rejectionReason: string | null;
  maxDurationMinutes: number | null;
  overtimeStartAt: Date | null;
  overtimeEndAt: Date | null;
  actualEndAt: Date | null;
  overtimeMinutes: number | null;
  technician: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
  location: { id: string; name: string; timezone: string | null } | null;
  timeEntry: { clockInAt: Date; clockOutAt: Date | null } | null;
};

const name = (p: { firstName?: string | null; lastName?: string | null } | null | undefined) => personName(p);

/** A stored signature as something the page may draw: a PNG/JPEG data URL, else nothing. */
function signatureUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.startsWith('data:')) return safeSignatureDataUrl(v);
  return /^[A-Za-z0-9+/=\s]+$/.test(v) ? safeSignatureDataUrl(`data:image/png;base64,${v.replace(/\s+/g, '')}`) : null;
}

export { DAY, MAX_PERIOD_DAYS, SUMMARY_CAP, PERSON, ROUND_SELECT, RoundRow, name, signatureUrl };
