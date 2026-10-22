import { type ClockOutShift } from '../home/clock-out-state';
import type { HandoverJob } from '../../lib/api';

/** ClockOutSheetProps, moved here unchanged out of clock-out-sheet.tsx. */
/**
 * CLOCK OUT — THE SHEET.
 *
 * A shift ends in a record, so this is set like one: the day drawn to scale,
 * the times as a receipt, and one jade button.
 *
 * ⚠️ NOTHING HERE MAY EVER BLOCK CLOCKING OUT — rule 1, and it was broken.
 * `canConfirm = notes.trim().length > 0` disabled both the button and the
 * submit handler, so **a member could not end their shift without typing a
 * sentence** — against a type whose own field is `notes?: string`, optional,
 * beside an `earlyReason` documented as "never refuses the clock-out for want
 * of a reason". Somebody standing in the rain at 15:00 was being asked to
 * write an essay before the clock would stop.
 *
 * ⚠️ AND THE PRIMARY WAS AMBER (`#d97706`). Amber is the `warn` token — it
 * means a variance from the roster. Clocking out is the correct end of a
 * shift, pressed every day by everybody; it is the primary, in jade. Amber
 * appears on this sheet only where something actually differs from the plan.
 *
 * ❌ NO TITLE AND NO QUESTION. "Clock Out / Are you sure you want to clock
 * out?" spent the top of the sheet restating the button, and made a daily act
 * sound risky. The eyebrow says where you are, the hero says what you did, the
 * button says what happens — the receipt IS the confirmation.
 *
 * ❌ AND NOT "What did you do today?". A shift is not a day: a night shift
 * clocks out on the wrong side of midnight, and the question then asks about
 * yesterday. The note is collapsed and marked optional.
 *
 * ⚠️ THE CLOCK-OUT TIME IS FROZEN AT OPEN — rule 4. A sheet left sitting on a
 * table must not silently bill more minutes than the receipt showed.
 */
export interface ClockOutSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * ⚠️ THREE FIELDS, NOT ONE. `earlyReason` and `overtimeReason` are their own
   * columns and mean different things to an approver; writing either into
   * `notes` (rule 6) buries a reason in free text nothing can read.
   */
  onConfirm: (input: {
    notes?: string;
    earlyReason?: string;
    overtimeReason?: string;
    handovers?: { taskId: string; note: string }[];
  }) => void;
  isLoading?: boolean;
  /** Everything the sheet shows. ⚠️ Nothing new is fetched — §11.4. */
  shift: ClockOutShift;
  /**
   * Jobs still in work — they PAUSE at this clock-out (shared tasks/handover.ts).
   * Each may carry a note of what was done and what is left; none is required:
   * a job left without one is flagged "no handover yet" and asked for later.
   */
  openJobs?: HandoverJob[];
  /** "It's done" — leave the sheet for the job, to finish it the normal way. */
  onFinishJob?: (taskId: string) => void;
}
