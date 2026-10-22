import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import type { MobileCustomer } from '../../lib/api';
import { useDuplicateCheck } from '../customer/card-duplicate';
import { useSaveScannedCard } from '../customer/card-save';
import { cardClientNames, cardDetails, cardExtrasKept, type CardDestination, type CardKind } from '../customer/card-review';
import type { CardReview } from './use-card-review';

/**
 * Whether the review can be saved, and saving it — after the duplicate check.
 */
export function useCardSaveFlow({ t, toast, read, kind, destination, company, spaceId, chooseDestination }: {
  t: TFunction;
  toast: { error: (message: string) => void; success: (message: string) => void };
  read: CardReview | null;
  kind: CardKind;
  destination: CardDestination;
  company: MobileCustomer | null;
  /** The workspace carried from the add sheet; absent = none. */
  spaceId: string | undefined;
  chooseDestination: (next: CardDestination, chosen: MobileCustomer | null) => void;
}) {
  const { save: commitCard } = useSaveScannedCard();
  const duplicate = useDuplicateCheck();
  const [saving, setSaving] = useState(false);

  /*
    ── Saving ────────────────────────────────────────────────────────────────

    The two roads (a client, or a contact person at a company already in the
    book) are in `useSaveScannedCard`, with the outbox lane and the no-offline
    fallback each needs. What is decided here is only whether to save at all.
  */

  const values = read?.values;

  /*
    The name the record will carry — what a duplicate would be a duplicate OF.

    ⚠️ On the "create the company" road that is the COMPANY'S name, not the
    person's. A second "BILLA AG" beside the "BILLA" already in the book is the
    damage this whole destination was refused over for so long, and checking the
    person's name there would look like a duplicate check while guarding
    precisely the wrong record.
  */
  const savedName = !values ? '' :
    destination === 'newCompany' ? values.company.trim()
    : destination === 'contact' ? values.name.trim()
    : cardClientNames(kind, values).name;
  const ready =
    !!values &&
    !!savedName &&
    !(destination === 'contact' && !company) &&
    !(destination === 'newCompany' && !values.name.trim());

  const commit = useCallback(async () => {
    if (!read) return;
    setSaving(true);
    try {
      const outcome = await commitCard({
        kind,
        destination,
        company,
        values: read.values,
        spaceId: spaceId || null,
        /*
          ⚠️ Resolved to plain strings HERE, at the last moment, because
          `Customer.details` holds `[{label, value}]` and a translation key
          written into a record is a key somebody reads on a client screen
          forever. `cardDetails` also drops a row the member emptied.

          ⚠️ Only where the destination can keep them: a contact person has no
          `details`, and the screen has already said so.
        */
        details: cardExtrasKept(destination) ? cardDetails(read.extras, t) : undefined,
      });
      if (!outcome) {
        toast.error(t('customers.addFailed'));
        return;
      }
      if (outcome.kind === 'refused') {
        toast.error(
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
          outcome.message ||
          t('customers.addFailed'),
        );
        return;
      }
      toast.success(outcome.kind === 'queued' ? t('offline.savedForLater') : t('customers.added'));
      router.back();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || t('customers.addFailed'));
    } finally {
      setSaving(false);
    }
  }, [commitCard, kind, destination, company, read, spaceId, t, toast]);

  /*
    ⚠️ The duplicate search happens HERE and not on the way in: the name it
    searches is the one the member has just finished correcting. It runs once
    per review (see `useDuplicateCheck`), so a second press after the warning
    goes straight through — the member has seen the answer and decided.
  */
  const attemptSave = useCallback(async () => {
    if (saving || !ready) return;
    setSaving(true);
    const found = await duplicate.check(savedName);
    setSaving(false);
    if (found) return;
    await commit();
  }, [saving, ready, duplicate, savedName, commit]);

  const saveAnyway = useCallback(() => {
    duplicate.dismiss();
    void commit();
  }, [duplicate, commit]);

  const openExisting = useCallback((client: MobileCustomer) => {
    duplicate.dismiss();
    // `replace`, not `push`: the member chose the client that already exists
    // over the one they were about to make, so the review has nothing left to
    // come back to.
    router.replace(`/(app)/customer/${client.id}`);
  }, [duplicate]);

  /*
    ⚠️ The company they were about to create is already here — so take it,
    WITHOUT leaving the review. The person, their direct line and their
    department are all still unsaved on this screen; navigating away to the
    company record would throw the scan out to show something the member never
    asked to visit. This turns the warning into the one action that keeps
    everything: file them at the firm that already exists.
  */
  const useExistingCompany = useCallback((client: MobileCustomer) => {
    duplicate.dismiss();
    chooseDestination('contact', client);
  }, [duplicate, chooseDestination]);

  return { duplicate, saving, ready, attemptSave, saveAnyway, openExisting, useExistingCompany };
}
