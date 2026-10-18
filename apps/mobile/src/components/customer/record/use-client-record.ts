import { useCallback } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, type MobileCustomer } from '../../../lib/api';
import type { MobileCustomerContact, MobileCustomerAddress } from '../../../lib/api/customers';
import { ROUTES } from '../../../lib/constants';
import { useQueuedCreate } from '../../../offline/actions/queued-create';
import { useQueuedWrite } from '../../../offline/actions/queued-write';
import { useSyncStatus } from '../../../offline/offline-context';
import {
  updateClientFromPhone,
  updateContactFromPhone,
  removeContactFromPhone,
  discardPendingContact,
} from '../../../offline/crm/client-actions';
import { clientLocalePayload } from '../../../lib/client-locale';
import { useToast } from '../../../island/island-context';
import type { ComposedActivity } from '../activity-composer';
import type { ReminderAssignee } from '../reminder-fields';
import { useAuth } from '../../../contexts/auth-context';
import type { ContactSide } from '../add-contact-sheet';
import { useClientRecordData } from './use-client-record-data';
import { useClientRecordActions } from './use-client-record-actions';
export { type RecordTab, FILTERS, isWaiting } from './client-record-helpers';

/*
  THE CLIENT RECORD — its data and every act on it, with no drawing.

  Lifted out of the screen whole when the record was redrawn: the loading,
  the outbox overlay (a change made with no signal shows at once and rolls
  itself back when the server refuses), the abilities read off the record,
  and every write. The views read this and nothing else.

  Three tabs, because there are three different jobs:
    ABOUT       who they are, where we stand, who to ask for, where to go
    ACTIVITY    what has happened — the composer and the whole feed
    REMINDERS   what has NOT happened yet, and what is late
*/

export function useClientRecord(id: string, linkedTab: string | undefined) {
  const data = useClientRecordActions(id, linkedTab);
  const {
    t,
    toast,
    setCustomer,
    setContacts,
    setCompanies,
    setLocaleOpen,
    setBusyLink,
    removing,
    setRemoving,
    write,
    refreshActivities,
    record,
    canWork,
  } = data;

  /**
   * ONE way to change this client, whatever moved it — the stage pills, the
   * language chips, the edit sheet.
   *
   * They are one PATCH on the server and one queued operation here, so they
   * share one function: three copies of "queue it, roll back on a refusal,
   * commit it on acceptance" is three places for those three cases to drift.
   *
   * ⚠️ Nothing is written to `customer` while it is only QUEUED. The record on
   * screen is `record`, which reads the outbox — so the change survives leaving
   * the screen, and a refusal takes it away by itself. What IS written here is
   * the accepted value: once the operation is done its overlay has gone, and
   * without this the screen would snap back to the value the server gave us
   * when the record was loaded.
   */
  const patchClient = useCallback(
    async (patch: Partial<MobileCustomer>, failed: string): Promise<boolean> => {
      const outcome = await write.run(
        (e) => updateClientFromPhone(e, { customerId: id, patch: patch as Record<string, unknown> }),
        () => customersApi.update(id, patch),
      );
      if (outcome.kind === 'refused') {
        toast.error(outcome.message || failed);
        return false;
      }
      if (outcome.kind === 'done') setCustomer((c) => (c ? { ...c, ...patch } : c));
      return true;
    },
    [id, write, toast],
  );

  const setStage = useCallback(
    async (next: string) => {
      if (!record || !canWork || next === (record.status || 'LEAD')) return;
      // A stage is the member's own reading of where the deal stands, so a replay
      // overwriting somebody else's later reading is the right answer — it IS the
      // latest word from the person doing the selling.
      if (await patchClient({ status: next }, t('customers.record.stageFailed'))) await refreshActivities();
    },
    [record, canWork, patchClient, refreshActivities, t],
  );

  /*
    Change the client's language for emails. A refusal takes the new value off
    the record AND says so — a language that silently reverted would be
    discovered when the next invitation arrives in English.
  */
  const setLocale = useCallback(
    async (value: string) => {
      if (!record) return;
      const locale = clientLocalePayload(value);
      setLocaleOpen(false);
      if (locale === (record.locale ?? null)) return;
      await patchClient({ locale }, t('customers.localeFailed'));
    },
    [record, patchClient, t],
  );

  const openRecord = useCallback((customerId: string) => {
    // `push`, not `replace`: walking from a company to a contact and back is
    // the normal motion here, and replace would strip the way back.
    router.push(`/(app)/customer/${customerId}` as never);
  }, []);

  /*
    Only offered on a link the server has minted — see `pendingContactLinks`.
    Which is why `companyId` is this record: the star appears on the "Contact
    people" card only, where this record IS the company.
  */
  const makePrimary = useCallback(
    async (link: MobileCustomerContact) => {
      setBusyLink(link.id);
      const outcome = await write.run(
        (e) => updateContactFromPhone(e, { linkId: link.id, companyId: id, isPrimary: true }),
        () => customersApi.updateContact(link.id, { isPrimary: true }),
      );
      setBusyLink(null);
      if (outcome.kind === 'refused') {
        toast.error(outcome.message || t('customers.record.contactFailed'));
        return;
      }
      // Only one primary per company, so the others must drop locally too — the
      // server enforces it and a refetch would agree, at the cost of a round trip
      // the person is watching. (While queued, `applyPendingContacts` says it.)
      if (outcome.kind === 'done') setContacts((list) => list.map((x) => ({ ...x, isPrimary: x.id === link.id })));
    },
    [id, write, t, toast],
  );

  const confirmRemove = useCallback(async () => {
    const link = removing;
    if (!link) return;
    setRemoving(null);
    /*
      ⚠️ A row that has never been sent is CANCELLED, not deleted. There is no
      link id for the server to act on — `addContact` mints one and accepts no
      client-supplied id — so the only honest meaning of "remove" here is
      "forget the attachment I made in the basement".
    */
    if (link.opId) {
      if (write.engine && !(await discardPendingContact(write.engine, link.opId))) {
        // Already on its way — it may have landed on an answer that was lost, so
        // the only honest thing is to wait for it and detach the real link.
        toast.error(t('customers.record.contactSending'));
      }
      return;
    }
    setBusyLink(link.id);
    // From the "Works at" card this record is the PERSON and the company is the
    // far end; from "Contact people" it is the other way round.
    const companyId = link.company?.id ?? id;
    const outcome = await write.run(
      (e) => removeContactFromPhone(e, { linkId: link.id, companyId }),
      () => customersApi.removeContact(link.id),
    );
    setBusyLink(null);
    if (outcome.kind === 'refused') {
      toast.error(outcome.message || t('customers.record.contactFailed'));
      return;
    }
    // Detaching keeps the PERSON — the link is what goes. Both panels are
    // filtered because either could be showing this link.
    if (outcome.kind === 'done') {
      setContacts((list) => list.filter((x) => x.id !== link.id));
      setCompanies((list) => list.filter((x) => x.id !== link.id));
    }
  }, [removing, id, write, t, toast]);

  /** The same words the Sync screen and every other queued thing use. */
  return {
    ...data,
    setStage,
    setLocale,
    openRecord,
    makePrimary,
    confirmRemove,
  };
}

export type ClientRecordModel = ReturnType<typeof useClientRecord>;
