import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CrmCaller, withContactKeys } from './customers-helpers';
import { CustomersServiceBase } from './customers-service.base';

/** Contact people: who works at a company, linking, changing, unlinking, promoting. */
@Injectable()
export class CustomerContactsService extends CustomersServiceBase {
  // ── Contact people ──────────────────────────────────────────────────────────
  /*
    A person who works at a company.

    A link between two records is a way to reach a record you were not shown, so
    every method below resolves BOTH sides through `reachable()` — which loads
    them with the organization filter and then applies the same per-record CRM
    rule the rest of this service uses. Ids from the request are never trusted to
    identify anything by themselves.
  */

  /** What a contact row looks like to the client — never the person's whole record. */
  private static readonly CONTACT_PERSON_SELECT = {
    id: true, name: true, email: true, phone: true, isContact: true,
  } as const;

  /** Who works at this company. */
  async listContacts(data: { companyId: string; organizationId: string; caller?: CrmCaller }) {
    const reach = await this.crmReachFor(data.caller, data.organizationId);
    await this.reachable(data.companyId, data.organizationId, reach, data.caller);
    const rows = await this.prisma.customerContact.findMany({
      where: { companyId: data.companyId, organizationId: data.organizationId },
      select: {
        id: true, role: true, isPrimary: true, createdAt: true,
        person: { select: CustomerContactsService.CONTACT_PERSON_SELECT },
      },
      // Primary first, then oldest — the person you ring is the top row, and the
      // rest keep a stable order so the panel does not reshuffle on every load.
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return { data: rows };
  }

  /** Which companies this person is a contact at. */
  async listContactCompanies(data: { personId: string; organizationId: string; caller?: CrmCaller }) {
    const reach = await this.crmReachFor(data.caller, data.organizationId);
    await this.reachable(data.personId, data.organizationId, reach, data.caller);
    const rows = await this.prisma.customerContact.findMany({
      where: { personId: data.personId, organizationId: data.organizationId },
      select: {
        id: true, role: true, isPrimary: true,
        company: { select: { id: true, name: true, industry: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return { data: rows };
  }

  /**
   * Attach a person to a company — an existing one, or a new one created here.
   *
   * Two different abilities on purpose, matching the rules this service already
   * has: LINKING is editing the company's information (`editInfo`), while
   * CREATING a person is creating a client (`manage`). A rep who may keep their
   * own client's details current can add the contact they were just given on the
   * phone; only somebody who may create clients can mint a new record.
   */
  async addContact(data: {
    companyId: string;
    organizationId: string;
    personId?: string;
    person?: { name?: string; email?: string | null; phone?: string | null };
    role?: string | null;
    isPrimary?: boolean;
    caller?: CrmCaller;
  }) {
    const reach = await this.crmReachFor(data.caller, data.organizationId);
    const company = await this.reachable(data.companyId, data.organizationId, reach, data.caller);
    // Linking is editing the COMPANY — decided by the workspace it is filed in.
    if (!company.caps.editInfo) throw new ForbiddenException('Not allowed to change this client');

    /*
      ⚠️ The `type` column is NOT a gate here, deliberately.

      It was, and that made the feature invisible: organizations record firms as
      PERSON all the time — a book of clients reading "BILLA AG", "Siemens AG",
      "voestalpine", every one of them typed as a person — because the toggle is
      an afterthought when somebody is adding a client in a hurry. Refusing those
      would have meant the panel appeared on none of the records that need it,
      and the customer would have had to re-type their whole book to earn it.

      So the relationship is stated the way people state it — this one works at
      that one — and the two ends are told apart by their POSITION in the link,
      not by a field somebody may never have set.
    */
    let personId = data.personId;
    if (personId) {
      const person = await this.reachable(personId, data.organizationId, reach, data.caller);
      if (person.id === company.id) throw new BadRequestException('A client cannot be its own contact.');
      /*
        Not both ways round.

        A and B cannot each be the other's contact person: it renders as two
        panels each claiming the other reports to it, and there is no reading of
        the relationship in which both are true. The existing pair is the one
        that stands; reverse it by removing that one first.
      */
      const reverse = await this.prisma.customerContact.findUnique({
        where: { companyId_personId: { companyId: person.id, personId: company.id } },
        select: { id: true },
      });
      if (reverse) {
        throw new BadRequestException(
          `${company.name} is already a contact of ${person.name}. Remove that first if you want it the other way round.`,
        );
      }
      /*
        Same workspace.

        Clients are listed per workspace and a rep's book is a workspace's book.
        Linking across them would drag a client into a space somebody can see
        without anyone granting it — a quiet widening of access that no screen
        would show. A client with no workspace (legacy, org-level) is allowed
        either way, because it belongs to all of them.
      */
      if (company.spaceId && person.spaceId && company.spaceId !== person.spaceId) {
        throw new BadRequestException('That person belongs to a different workspace.');
      }
    } else {
      // The new person is filed in the company's workspace, so that is where adding one must be allowed.
      if (!company.caps.create) throw new ForbiddenException('Not allowed to create clients');
      const name = (data.person?.name || '').trim();
      if (!name) throw new BadRequestException('A name is required');
      const created = await this.prisma.customer.create({
        data: withContactKeys({
          organizationId: data.organizationId,
          name,
          email: data.person?.email?.trim() || null,
          phone: data.person?.phone?.trim() || null,
          type: 'PERSON',
          // Created BECAUSE of a company, so not a client of yours: kept out of
          // the CRM list and out of the billable count until somebody says
          // otherwise. See Customer.isContact.
          isContact: true,
          spaceId: company.spaceId,
          ownerId: data.caller?.userId ?? null,
        }),
        select: { id: true },
      });
      personId = created.id;
    }

    const role = (data.role || '').trim().slice(0, 120) || null;

    /*
      One primary per company, and the link itself, in ONE transaction.

      Two primaries and none are both silent breakage — the panel would show two
      stars, or the company would have nobody to ring with no way to tell that
      from "not set yet". Same discipline as the default workspace.
    */
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.customerContact.updateMany({
          where: { companyId: company.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      /*
        The typed note becomes the person, and then stops existing.

        `contactName` is a free-text field printed in the client list. Once the
        same name is a real contact person there are two copies of it, and they
        disagree the moment anybody edits one — remove the contact and the row
        resurrects the string, which reads as the removal having failed.

        Cleared only when it IS this person, compared without case or edge
        spacing. A note saying something else ("Reception", "ask for Klaus") is
        somebody's information and is not ours to delete.
      */
      const linkedName = (data.person?.name ?? '').trim() || null;
      const noteName = (company.contactName ?? '').trim();
      if (noteName) {
        const personName =
          linkedName ??
          (await tx.customer.findUnique({ where: { id: personId! }, select: { name: true } }))?.name ??
          '';
        if (noteName.toLowerCase() === personName.trim().toLowerCase()) {
          await tx.customer.update({ where: { id: company.id }, data: { contactName: null } });
        }
      }

      const link = await tx.customerContact.upsert({
        // The unique pair is what makes a double-click safe: a second identical
        // request updates the row it already created instead of failing.
        where: { companyId_personId: { companyId: company.id, personId: personId! } },
        create: {
          organizationId: data.organizationId,
          companyId: company.id,
          personId: personId!,
          role,
          isPrimary: !!data.isPrimary,
        },
        update: { role, isPrimary: !!data.isPrimary },
        select: {
          id: true, role: true, isPrimary: true,
          person: { select: CustomerContactsService.CONTACT_PERSON_SELECT },
        },
      });
      return { data: link };
    });
  }

  /** Change a contact's role, or make them the one to ring first. */
  async updateContact(data: {
    linkId: string;
    organizationId: string;
    role?: string | null;
    isPrimary?: boolean;
    caller?: CrmCaller;
  }) {
    const reach = await this.crmReachFor(data.caller, data.organizationId);
    const link = await this.prisma.customerContact.findFirst({
      where: { id: data.linkId, organizationId: data.organizationId },
      select: { id: true, companyId: true },
    });
    if (!link) throw new NotFoundException('Contact not found');
    // The COMPANY is the record being changed, so that is the one whose access
    // decides — reached the same way as everywhere else.
    const company = await this.reachable(link.companyId, data.organizationId, reach, data.caller);
    if (!company.caps.editInfo) throw new ForbiddenException('Not allowed to change this client');

    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary === true) {
        await tx.customerContact.updateMany({
          where: { companyId: link.companyId, isPrimary: true, NOT: { id: link.id } },
          data: { isPrimary: false },
        });
      }
      const updated = await tx.customerContact.update({
        where: { id: link.id },
        data: {
          ...(data.role !== undefined ? { role: (data.role || '').trim().slice(0, 120) || null } : {}),
          ...(data.isPrimary !== undefined ? { isPrimary: !!data.isPrimary } : {}),
        },
        select: {
          id: true, role: true, isPrimary: true,
          person: { select: CustomerContactsService.CONTACT_PERSON_SELECT },
        },
      });
      return { data: updated };
    });
  }

  /**
   * Detach a person from a company.
   *
   * The PERSON is not deleted — they may work somewhere else tomorrow, and their
   * history is worth keeping either way. Removing the link is the whole action.
   */
  async removeContact(data: { linkId: string; organizationId: string; caller?: CrmCaller }) {
    const reach = await this.crmReachFor(data.caller, data.organizationId);
    const link = await this.prisma.customerContact.findFirst({
      where: { id: data.linkId, organizationId: data.organizationId },
      select: { id: true, companyId: true },
    });
    if (!link) throw new NotFoundException('Contact not found');
    const company = await this.reachable(link.companyId, data.organizationId, reach, data.caller);
    if (!company.caps.editInfo) throw new ForbiddenException('Not allowed to change this client');
    await this.prisma.customerContact.delete({ where: { id: link.id } });
    return { data: { id: link.id } };
  }

  /**
   * Promote a contact into a client of their own.
   *
   * The one button that moves somebody into the CRM list and onto the bill, so
   * it is explicit and needs the ability to create clients — the same one it
   * takes to add a client any other way.
   */
  async promoteContact(data: { personId: string; organizationId: string; caller?: CrmCaller }) {
    const reach = await this.crmReachFor(data.caller, data.organizationId);
    const person = await this.reachable(data.personId, data.organizationId, reach, data.caller);
    // Promoting puts them on the client list of the workspace they are filed in.
    if (!person.caps.create) throw new ForbiddenException('Not allowed to create clients');
    if (!person.isContact) return { data: { id: person.id, isContact: false } };
    await this.prisma.customer.update({ where: { id: person.id }, data: { isContact: false } });
    return { data: { id: person.id, isContact: false } };
  }
}
