import { useCallback, useRef } from 'react';
import { customersApi, type MobileCustomer } from '../../lib/api';
import { newClientInput } from '../../lib/client-locale';
import { uuidv7 } from '../../offline/ids';
import { useQueuedCreate } from '../../offline/actions/queued-create';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { addContactFromPhone } from '../../offline/crm/client-actions';
import type { ActionOutcome } from '../../offline/actions/outcome';
import {
  cardClientExtras, cardClientNames, cardContactInput,
  type CardDestination, type CardKind, type CardValues,
} from './card-review';

/**
 * SAVING WHAT WAS READ — the three roads a scanned card can take.
 *
 * A card becomes a CLIENT (`POST /customers`), a CONTACT PERSON at a company
 * that is already in the book (`POST /customers/:id/contacts`), or — the road
 * added for the cards where the firm is new — BOTH, the company created and the
 * person attached to it. They are different routes, different permissions and
 * different outbox operations, so they are written once here rather than twice
 * on a screen that also owns a camera.
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
  /**
   * The company this hook has already created, and under what name.
   *
   * A ref rather than state: nothing renders from it, and a re-render on Save
   * would remount the field the member is standing in. See the warning at its
   * one use — it exists so a retry cannot make a second firm.
   */
  const madeCompany = useRef<{ name: string; id: string } | null>(null);

  /**
   * Hang the person off a company — the SAME call whether the company was
   * already in the book or was created a moment ago from this card.
   *
   * ⚠️ One copy, because the two roads differ only in where the id came from.
   * Written twice, the newer one would sooner or later forget the job title,
   * and a department read off a card and then dropped is the exact habit the
   * review screen was rebuilt to break. What travels is decided by
   * `cardContactInput` in `card-review.ts`, where it can be argued with.
   *
   * ⚠️ The person is created as a CONTACT (`isContact` on the server), not a
   * client. That flag is what keeps a firm with six contacts from reading as
   * six clients on a bill that charges per client, so this must never be routed
   * through `POST /customers` as a shortcut however similar the fields look.
   */
  const attachContact = useCallback(
    (companyId: string, values: CardValues): Promise<ActionOutcome> => {
      const input = cardContactInput(values);
      return write.run(
        (e) => addContactFromPhone(e, { companyId, ...input, shownName: input.person.name }),
        () => customersApi.addContact(companyId, input),
      );
    },
    [write],
  );

  /** `null` when there is nothing to save — an empty name, or no company chosen. */
  const save = useCallback(
    async (plan: ScannedCardSave): Promise<ActionOutcome | null> => {
      const { kind, destination, company, values, spaceId } = plan;

      /*
        ── The firm is new: create it, then hang the person off it ─────────────

        ⚠️ TWO OPERATIONS, AND THE SECOND WAITS FOR THE FIRST. The phone mints
        the company's id before either is queued, so `addContactFromPhone` can
        name it — `dependsOnClients` then finds the create still in the outbox
        and makes the link wait for it. Without that the contact reaches the
        server first and is refused for a company that does not exist yet, on
        precisely the walk back to the van this app exists for.

        ⚠️ The id is the phone's because `create_customer` honours one that
        matches CLIENT_ID. On a build with no offline layer there is no outbox
        and no honoured id, so the SERVER'S answer names the company instead —
        which is why the id is read back out of the outcome rather than assumed.
      */
      if (kind === 'PERSON' && destination === 'newCompany') {
        const firm = values.company.trim();
        if (!firm || !values.name.trim()) return null;

        /*
          ⚠️ THE SECOND PRESS MUST NOT MAKE A SECOND FIRM.

          This road is two operations, and only the first of them can succeed on
          its own — a contact refused after the company was made leaves the
          member looking at an error with the firm already in the book. They
          press Save again, as anybody would, and the duplicate this whole
          destination was refused over for years is created by the recovery
          rather than by the member. So the company made for this name is
          remembered and reused; the retry attaches the person and stops.
        */
        let companyId = madeCompany.current?.name === firm ? madeCompany.current.id : undefined;
        if (!companyId) {
          const minted = uuidv7();
          // The firm takes what belongs to a firm. The email and the phone on a
          // person's card are the PERSON'S and travel with them, below.
          const body = newClientInput({ name: firm, contactName: '', email: '', phone: '' }, spaceId, '');
          if (!body) return null;
          const input = { ...body, type: 'COMPANY' as const, ...cardClientExtras('COMPANY', values) };

          const made = await clientCreate.run(
            { id: minted, lane: 'crm:new', body: input },
            () => customersApi.create(input),
          );
          if (made.kind === 'refused') return made;
          // ⚠️ On a build with no offline layer the phone's id is not honoured,
          // so the SERVER'S answer names the company — read it back rather than
          // assume it.
          const serverId = made.kind === 'done' ? (made.response as MobileCustomer | undefined)?.id : undefined;
          companyId = serverId || minted;
          madeCompany.current = { name: firm, id: companyId };
        }

        return attachContact(companyId, values);
      }

      if (kind === 'PERSON' && destination === 'contact') {
        if (!company) return null;
        if (!values.name.trim()) return null;
        return attachContact(company.id, values);
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
    [clientCreate, write, attachContact],
  );

  return { save };
}
