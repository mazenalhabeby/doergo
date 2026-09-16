import { useCallback } from 'react';
import { customersApi, type MobileCustomer } from '../../lib/api';
import { newClientInput } from '../../lib/client-locale';
import { useQueuedCreate } from '../../offline/actions/queued-create';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { addContactFromPhone } from '../../offline/crm/client-actions';
import type { ActionOutcome } from '../../offline/actions/outcome';
import { cardClientExtras, cardClientNames, type CardDestination, type CardKind, type CardValues } from './card-review';

/**
 * SAVING WHAT WAS READ — the two roads a scanned card can take.
 *
 * A card becomes a CLIENT (`POST /customers`) or a CONTACT PERSON at a company
 * that is already in the book (`POST /customers/:id/contacts`). They are
 * different routes, different permissions and different outbox operations, so
 * they are written once here rather than twice on a screen that also owns a
 * camera.
 *
 * ⚠️ BOTH GO THROUGH THE OUTBOX. `customer.create` and `customer.contactAdd`
 * are in `SYNC_OPERATIONS`, which means a direct call from a screen loses the
 * save in a basement and repeats it after a dropped answer —
 * `queued-writes-guard.spec.ts` fails on one, correctly. The plain API call is
 * passed as the fallback the queue helper uses on a build with no offline
 * layer (1.0.5 and older), which is the shape that guard recognises.
 *
 * ⚠️ The client body is built by `newClientInput`, the SAME builder the typed
 * add form uses. The two had already drifted once: the form sent the workspace
 * it was opened in and an explicit email language, and this screen sent
 * neither, so a scanned client landed filed in no workspace with the language
 * key absent from the outbox entry — where it can never be added later.
 */

export interface ScannedCardSave {
  kind: CardKind;
  destination: CardDestination;
  /** The company this person belongs to. Required when `destination` is 'contact'. */
  company: MobileCustomer | null;
  values: CardValues;
  /** The workspace the add sheet was looking at, carried through the route. */
  spaceId: string | null;
}

export function useSaveScannedCard() {
  const clientCreate = useQueuedCreate('customer.create');
  const write = useQueuedWrite();

  /** `null` when there is nothing to save — an empty name, or no company chosen. */
  const save = useCallback(
    async (plan: ScannedCardSave): Promise<ActionOutcome | null> => {
      const { kind, destination, company, values, spaceId } = plan;

      if (kind === 'PERSON' && destination === 'contact') {
        if (!company) return null;
        const name = values.name.trim();
        if (!name) return null;
        /*
          The job title becomes `CustomerContact.role` — the home it never had,
          and the reason this screen used to read the title, badge it, ask for a
          correction and then drop it.

          ⚠️ The person is created as a CONTACT (`isContact` on the server), not
          a client. That flag is what keeps a firm with six contacts from
          reading as six clients on a bill that charges per client, so this must
          never be routed through `POST /customers` as a shortcut however
          similar the fields look.
        */
        const input = {
          person: {
            name,
            email: values.email.trim() || undefined,
            phone: values.phone.trim() || undefined,
          },
          ...(values.title.trim() ? { role: values.title.trim() } : {}),
        };
        return write.run(
          (e) => addContactFromPhone(e, { companyId: company.id, ...input, shownName: name }),
          () => customersApi.addContact(company.id, input),
        );
      }

      const { name, contactName } = cardClientNames(kind, values);
      const base = newClientInput(
        { name, contactName, email: values.email, phone: values.phone },
        spaceId,
        // "" — same as the organization, which is the add sheet's own default.
        // A card gives no hint about which language to write to somebody in.
        '',
      );
      if (!base) return null;
      /*
        `type` is what makes the difference between the two kinds real on the
        server. Sent explicitly, because `Customer.type` defaults to PERSON — a
        company card saved without it becomes a person with a VAT number, and
        `clearCompanyFields` would take the VAT number off it on the next edit.
      */
      const input = { ...base, type: kind, ...cardClientExtras(kind, values) };
      // The card's fields go to the client they create, and nowhere else — held
      // in the member's encrypted outbox until there is a signal to send them.
      return clientCreate.run({ lane: 'crm:new', body: input }, () => customersApi.create(input));
    },
    // `run` on both helpers is re-made per render; the screen calls `save` from
    // a handler rather than handing it to a memoised child, so identity costs
    // nothing here.
    [clientCreate, write],
  );

  return { save };
}
