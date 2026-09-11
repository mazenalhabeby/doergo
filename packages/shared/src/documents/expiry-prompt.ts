/**
 * What the expiry field should show — decided once, for every surface.
 *
 * ⚠️ THE DOCUMENT IS THE SOURCE OF THE DATE. A member holding a licence should
 * photograph it and be shown what it says, not be handed an empty date picker
 * and asked to copy a number off the thing they have just photographed.
 *
 * Both clients had the reading wired and still led with the picker: the block
 * rendered the moment a TYPE was chosen, before any file existed, so the first
 * thing on screen was "Expires on — pick a date". Filling it in afterwards does
 * not undo that; by then somebody has already typed it.
 *
 * So the order is inverted here, and the rule lives in one place because a
 * member must not get a different product depending on which surface they open.
 * Five states, and only two of them ask anybody for anything:
 *
 *   NOT_NEEDED  the type has no expiry — say nothing at all
 *   WAITING     no document yet — the date comes from it, so do not ask first
 *   READING     the document is being read — say so, ask nothing
 *   FOUND       a date came off the document — STATE it, with where it came
 *               from, and offer a correction for the member who disagrees
 *   ASK         nothing could be read — now the picker, with the reason
 *
 * `certainty` separates the two ways a date can be found, and the difference is
 * real: an MRZ expiry is proved by a check digit, and a date scraped off
 * printed text is the latest one the page happened to show. Both save the
 * typing; only one is a fact, and a member confirming it is entitled to know
 * which they are looking at.
 */

export type ExpirySource = 'MRZ' | 'TEXT' | 'NOTHING';

export type ExpiryPrompt =
  | { state: 'NOT_NEEDED' }
  | { state: 'WAITING' }
  | { state: 'READING' }
  | { state: 'FOUND'; value: string; certainty: 'PROVEN' | 'SUGGESTED' }
  | { state: 'ASK'; value: string | null; reason: 'UNREADABLE' | 'CORRECTING' };

export interface ExpiryPromptInput {
  /** Does this document type carry an expiry at all? */
  hasExpiry: boolean;
  /** Has a file been chosen? The date comes from it. */
  hasFile: boolean;
  /** A read is in flight. */
  reading: boolean;
  /** What the read said, or null before one has happened. */
  source: ExpirySource | null;
  /** ISO date, from the read or from the member. */
  value: string | null;
  /** The member asked to set it themselves. Always wins. */
  overriding?: boolean;
}

export function expiryPrompt(input: ExpiryPromptInput): ExpiryPrompt {
  if (!input.hasExpiry) return { state: 'NOT_NEEDED' };

  /*
    The override is checked FIRST, before `hasFile`.

    A member who has read what the app filled in and disagrees with it must be
    able to correct it — being certain is not the same as being right, and a
    document photographed at an angle can produce a confident wrong answer.
    Nothing here may take that back off them.
  */
  if (input.overriding) {
    return { state: 'ASK', value: input.value, reason: 'CORRECTING' };
  }

  // ⚠️ Before the file, NOTHING. This is the whole fix: the picker used to be
  // the first thing on the screen, and a field already on screen is a field
  // somebody fills in.
  if (!input.hasFile) return { state: 'WAITING' };
  if (input.reading) return { state: 'READING' };

  if (input.value && (input.source === 'MRZ' || input.source === 'TEXT')) {
    return {
      state: 'FOUND',
      value: input.value,
      certainty: input.source === 'MRZ' ? 'PROVEN' : 'SUGGESTED',
    };
  }

  /*
    Read, and nothing found — a PDF (which cannot be rasterised here), a photo
    too small or too dark, or a document that genuinely prints no date.

    Asking now is honest, and it is the ONLY branch that asks unprompted. It
    carries its reason so the screen can say why it is asking, which is the
    difference between a form and a conversation.
  */
  if (input.source === 'NOTHING') {
    return { state: 'ASK', value: input.value, reason: 'UNREADABLE' };
  }

  // A file, not reading, no answer yet — the read failed to start or its
  // result was dropped. Treat it as unreadable rather than leaving a required
  // field with no way to fill it.
  return { state: 'ASK', value: input.value, reason: 'UNREADABLE' };
}

/**
 * May this be sent?
 *
 * ⚠️ Not "is the field filled in". A type with an expiry still needs one, but
 * the question the screen should ask is whether anything is OUTSTANDING — and
 * while a document is being read, nothing is.
 */
export function expiryReady(prompt: ExpiryPrompt): boolean {
  switch (prompt.state) {
    case 'NOT_NEEDED':
      return true;
    case 'FOUND':
      return true;
    case 'ASK':
      return !!prompt.value;
    // A document still being read, or not yet chosen, is not ready — but the
    // reason is the document, not the date.
    case 'WAITING':
    case 'READING':
      return false;
  }
}
