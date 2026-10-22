import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';
import { socialOf } from '@hbcfield/shared/client';
import type { ParsedCard, CardReadQuality } from '../../lib/card-scan';
import type { MobileCustomer } from '../../lib/api';
import {
  CARD_FIELDS, cardCertainty, cardContested, cardHolding, fieldNeedsLook, guessCardKind,
  readCard, reRankGuesses,
  type CardCertainty, type CardDestination, type CardExtraRow, type CardFieldKey, type CardKind,
  type CardValues,
} from '../customer/card-review';

/**
 * EVERYTHING THE READ PRODUCED, in one piece of state.
 *
 * ⚠️ One object, not eight `useState`s, because a correction changes several of
 * them AT ONCE and from each other: picking a line marks that field answered,
 * moves its value, records which line it now holds, and then re-ranks every
 * field the member has NOT answered against the lines still free. Split across
 * separate setters that is four functional updates that cannot read one
 * another, and the re-rank would run on last render's values.
 *
 * `kind`, `destination` and `company` stay OUTSIDE it on purpose — see where
 * they are declared. They are the member's answers about where the person goes,
 * not the reader's answers about what the card said.
 */
export interface CardReview {
  card: ParsedCard;
  values: CardValues;
  /** What the reader could PROVE, plus anything the member has since chosen. */
  certain: CardCertainty;
  /** The reader was deciding between two lines and had no grounds to. */
  contested: CardCertainty;
  /**
   * WHICH ROWS OPENED UNDER "Worth a look", frozen when the card was read.
   *
   * ⚠️ Membership of a group must NOT follow what is being typed. Computed live,
   * the first character into an empty field moves its row from one heading to
   * the other, React unmounts the box being typed in, and the keyboard closes on
   * the member mid-word. The COLOUR still follows the live value (see
   * `fieldNeedsLook`), so a field that has been answered goes quiet where it is.
   */
  flagged: CardCertainty;
  /** Fields the MEMBER answered. Never re-ranked from under them. */
  answered: Partial<Record<CardFieldKey, true>>;
  /** Which line each field is standing on — what stops two fields sharing one. */
  holding: Partial<Record<CardFieldKey, number>>;
  /** What the card said that no field wanted. */
  extras: CardExtraRow[];
  /** Was that a good look at the card? Said out loud when it was not. */
  quality: CardReadQuality;
}

/**
 * What the read produced, and every correction the member makes to it.
 *
 * The camera hands a merged card to `applyRead`; everything after that edits
 * the ANSWER, never the source.
 */
export function useCardReview({ t, toastError }: {
  t: TFunction;
  /** The toast's stable `error` function — see the note in the screen. */
  toastError: (message: string) => void;
}) {
  const [read, setRead] = useState<CardReview | null>(null);
  /*
    The reader's guess about the card, and the member's override of it.

    Held apart from `read` so "Scan again" cannot leave the previous card's
    answer selected under the new one's fields, and so the reason line keeps
    saying what the READER thought even after the member has disagreed with it.
  */
  const [kind, setKind] = useState<CardKind>('COMPANY');
  const [why, setWhy] = useState<ReturnType<typeof guessCardKind>['why']>('unsure');
  const [destination, setDestination] = useState<CardDestination>('client');
  const [company, setCompany] = useState<MobileCustomer | null>(null);
  /** Which row has its card lines open. One at a time — eight open lists is a wall. */
  const [picking, setPicking] = useState<CardFieldKey | null>(null);

  /** A fresh card from the camera: the review starts over. */
  const applyRead = useCallback((parsed: ParsedCard, quality: CardReadQuality) => {
    const guess = guessCardKind(parsed);
    // `readCard` splits what the reader placed from what it merely
    // understood, and keeps a social link out of `website` on the way past.
    const { values, extras } = readCard(parsed);
    const certain = cardCertainty(parsed);
    const contested = cardContested(parsed);
    setRead({
      card: parsed,
      values,
      certain,
      contested,
      // Contested counts as worth a look: the reader is guessing between two
      // lines, which is exactly the case a person can settle in one tap.
      flagged: Object.fromEntries(CARD_FIELDS.map((key) =>
        [key, fieldNeedsLook(values[key], certain[key]) || !!contested[key]])),
      answered: {},
      holding: cardHolding(parsed),
      extras,
      quality,
    });
    setKind(guess.kind);
    setWhy(guess.why);
    /*
      A fresh review every time. A person filed as a contact at Siemens on
      the last card must not leave Siemens selected under the next one — the
      save would be right about the fields and wrong about the company, which
      is the kind of mistake nobody notices until the office does.
    */
    setDestination('client');
    setCompany(null);
    setPicking(null);
  }, []);

  /*
    ── Editing what was read ──────────────────────────────────────────────────

    All of these are stable across renders, so a keystroke in one row does not
    re-render the other seven. The rows are memoised on their props and take the
    field key rather than a closure written per row at the call site, which is
    what makes the memo worth having.

    ⚠️ Nothing here re-reads the card. The photograph is parsed ONCE, at
    capture, and deleted; these edit the answer, never the source.
  */
  const setValue = useCallback((key: CardFieldKey, value: string) => {
    setRead((p) => p && ({
      ...p,
      values: { ...p.values, [key]: value },
      /*
        ⚠️ TYPING IS ANSWERING. From the first keystroke this field is the
        member's, and a later correction elsewhere must never re-rank it out
        from under them — which is the one thing that would make corrections a
        thing people undo rather than make.
      */
      answered: { ...p.answered, [key]: true as const },
    }));
  }, []);

  const toggleLines = useCallback((key: CardFieldKey) => {
    setPicking((p) => (p === key ? null : key));
  }, []);

  const pickLine = useCallback((key: CardFieldKey, line: string, index: number) => {
    /*
      ⚠️ A SOCIAL LINK MAY NOT BECOME THE WEBSITE, however it was chosen.
      `facebook.com/stadt.gmunden` passes every "looks like a URL" test ever
      written, and on the card this was found on `gmunden.at` was printed two
      characters away. Kept rather than refused: it goes into the extras, where
      it is filed under the network's own name.
    */
    const social = key === 'website' ? socialOf(line) : null;
    if (social) {
      setRead((p) => p && ({
        ...p,
        extras: p.extras.some((x) => x.value === line)
          ? p.extras
          : [...p.extras, { id: `s-${index}-${line}`, labelKey: social.labelKey, value: line }],
      }));
      toastError(t('scan.socialNotWebsite'));
      setPicking(null);
      return;
    }

    setRead((p) => {
      if (!p) return p;
      const answered = { ...p.answered, [key]: true as const };
      /*
        ⚠️ THE CORRECTION RE-RANKS THE REST. The line the member just claimed is
        no longer available to any other field, so every field they have NOT
        answered is re-run against the lines that are left. Leaving them stale
        shows one fact in two places and invites the member to save it that way.
        The rule is in `reRankGuesses`, where it can be tested without a camera.
      */
      const ranked = reRankGuesses(
        p.card,
        { ...p.values, [key]: line },
        new Set(Object.keys(answered) as CardFieldKey[]),
        { ...p.holding, [key]: index },
      );
      return {
        ...p,
        values: ranked.values,
        holding: ranked.holding,
        answered,
        // Chosen by a person — no longer a guess, so the row stops asking.
        certain: { ...p.certain, [key]: true },
      };
    });
    setPicking(null);
  }, [t, toastError]);

  /* ── The extras: rename one, correct one, drop one ───────────────────────── */

  const renameExtra = useCallback((id: string, label: string) => {
    // `rename` rather than writing over `label`/`labelKey`: the card's own word
    // and ours both stay recoverable if the member clears the box again.
    setRead((p) => p && ({
      ...p,
      extras: p.extras.map((x) => (x.id === id ? { ...x, rename: label } : x)),
    }));
  }, []);

  const setExtraValue = useCallback((id: string, value: string) => {
    setRead((p) => p && ({
      ...p,
      extras: p.extras.map((x) => (x.id === id ? { ...x, value } : x)),
    }));
  }, []);

  const dropExtra = useCallback((id: string) => {
    setRead((p) => p && ({ ...p, extras: p.extras.filter((x) => x.id !== id) }));
  }, []);

  const chooseDestination = useCallback((next: CardDestination, chosen: MobileCustomer | null) => {
    setDestination(next);
    setCompany(chosen);
    /*
      ⚠️ CREATING the company is the one exit that needs a name to exist before
      the member can even see what they are agreeing to, and on the card this
      was built for the firm's name is a hand-drawn logo no reader can touch. So
      the domain's answer is seeded HERE, into an ordinary editable row, the
      moment the exit is chosen — and only when nothing was read, so it can
      never overwrite what the card actually printed.
    */
    if (next === 'newCompany') {
      setRead((p) => (!p || p.values.company.trim() ? p : {
        ...p,
        values: { ...p.values, company: p.card.companySuggestion ?? '' },
      }));
    }
  }, []);

  /*
    ⚠️ Changing the kind RESETS where the person was going.

    "Contact at Siemens" only means anything on a person's card — the question
    is not even asked on a firm's. Left standing it is state the screen has
    stopped showing and the save still reads: `ready` would be computed from the
    contact road (a company is chosen, so Save is lit) while the save itself
    takes the client road, and a firm would be created under the person's name
    with a company selected that nothing ever used.
  */
  const chooseKind = useCallback((next: CardKind) => {
    setKind(next);
    if (next === 'COMPANY') {
      setDestination('client');
      setCompany(null);
    }
  }, []);

  const scanAgain = useCallback(() => setRead(null), []);

  return {
    read, kind, why, destination, company, picking,
    applyRead, setValue, toggleLines, pickLine, renameExtra, setExtraValue, dropExtra,
    chooseDestination, chooseKind, scanAgain,
  };
}
