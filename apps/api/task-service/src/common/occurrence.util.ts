import { BadRequestException } from '@nestjs/common';
import { assessFix, assessOccurrence, type OccurrenceEvidence } from '@hbcfield/shared';

export interface JudgedOccurrence {
  /** The time to record: the tap's own, when the phone sent one; otherwise now. */
  at: Date;
  /** How it was recorded, for the person who reviews it. */
  flags: string[];
  /** Whether the phone sent evidence at all — an old app, or the web, does not. */
  fromEvidence: boolean;
}

/**
 * When did this action happen, and is that believable?
 *
 * The one place a service turns a phone's evidence into a time. Refuses only the
 * impossible (the future, or before the step it follows); everything doubtful is
 * returned as flags for a person, never silently believed or thrown away.
 */
export function judgeOccurrence(
  evidence: OccurrenceEvidence | undefined | null,
  previousAt: Date | null | undefined,
  now: Date = new Date(),
): JudgedOccurrence {
  if (!evidence) return { at: now, flags: [], fromEvidence: false };
  const assessed = assessOccurrence(evidence, { now, previousAt: previousAt ?? null });
  if (assessed.refusal) {
    throw new BadRequestException({ message: assessed.refusal.message, code: assessed.refusal.code });
  }
  return { at: assessed.occurredAt, flags: [...assessed.flags], fromEvidence: true };
}

/**
 * Where the tap happened, when the phone recorded it.
 *
 * Returns the fix to judge instead of whatever position the request carries
 * (which, for a replayed request, is where the phone was when it sent it).
 * A mock location is flagged, not refused — a person decides; a fix that is
 * not evidence of the tap at all is refused.
 */
export function fixOfTap(
  evidence: OccurrenceEvidence | undefined | null,
  at: Date,
  flags: string[],
): { lat: number; lng: number; accuracy: number } | null {
  const fix = evidence?.fix;
  if (!fix) return null;
  const checked = assessFix(fix, at);
  if (!checked.ok) {
    if (checked.code !== 'FIX_MOCKED') {
      throw new BadRequestException({ message: checked.message, code: checked.code });
    }
    flags.push('FIX_MOCKED');
  }
  return { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy };
}
