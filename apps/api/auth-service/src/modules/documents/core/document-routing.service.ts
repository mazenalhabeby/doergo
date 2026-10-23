import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { parseRoute, isUsableEmail, isSelfSigning, normalizeEmail, personName, PrismaService } from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { type DocumentActor, type SignerCandidate, type RouteCandidateStep } from './document-common';
import { SignerCandidatesService, noSignerMessage } from './signer-candidates.service';

/**
 * The signing route: who each step of a type's chain resolves to, frozen onto a
 * document when it is issued, and what is waiting on whom.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentRoutingService {
  constructor(private readonly prisma: PrismaService, private readonly signers: SignerCandidatesService) {}

  /**
   * Turn a type's route into real signer rows for one document.
   *
   * Called inside the issuing transaction, so a document either has its whole
   * chain or none of it — a half-built route would strand a document with no
   * way to tell whose turn it was.
   *
   * Frozen here on purpose. A member changing manager next month must not
   * re-route a document already in flight, and the certificate has to be able
   * to say who was ASKED, not who would be asked today.
   *
   * A step with no candidate is written as SKIPPED rather than left pending or
   * dropped. Pending would strand the chain on somebody who does not exist;
   * dropping it would hide from the register that the route asked for a signer
   * this document never had.
   */
  async createSignerRows(
    tx: Prisma.TransactionClient,
    document: { id: string; userId: string; organizationId: string },
    signerRoute: unknown,
    choices?: Array<{
      order: number;
      userId?: string | null;
      customerId?: string | null;
      /** Typed in for this document — a counterparty with no record anywhere. */
      email?: string | null;
      name?: string | null;
    }>,
  ): Promise<void> {
    const route = parseRoute(signerRoute);
    if (!route) return; // No route: one signature by the member, exactly as before.

    for (const [i, step] of route.entries()) {
      const order = i + 1;

      /*
        A customer step resolves to the client of a space this member works in,
        and is signed by an emailed link rather than a login. Refused until
        there was a way to sign it — there is now.
      */
      const chosen = choices?.find((c) => c.order === order);
      /*
        The member is the document's own `userId` — by definition, not by
        lookup. Resolving them through a query would spend a round trip to
        learn something already in hand, and would make the step SKIP if that
        query ever came back empty: a time sheet published as though nobody
        had to sign it, which is the one outcome this chain exists to prevent.
      */
      const candidates: SignerCandidate[] =
        step.role === 'MEMBER'
          ? [{ kind: 'USER', id: document.userId, name: '', email: null }]
          : await this.signers.candidatesForRole(document.organizationId, document.userId, step.role);

      let userId: string | null = null;
      let customerId: string | null = null;
      let email: string | null = null;
      let contactName: string | null = null;
      let eligibleUserIds: string[] = [];

      /*
        Typed in, for a counterparty the system has never heard of.

        Always allowed, whatever the cascade offered. A closed list is exactly
        useless the one time somebody must send a document to a person who is
        not a member, not a CRM client and not a space's contact — and that is
        an ordinary Tuesday, not an edge case.

        It is checked against the candidates ONLY when it claims to be one of
        them. A free address claims nothing, so there is nothing to check it
        against — the issuer is choosing where to send a document they can
        already open, which is a decision they are entitled to make and which
        the evidence trail records.
      */
      if (chosen?.email && !chosen.userId && !chosen.customerId) {
        const addr = normalizeEmail(chosen.email);
        if (!isUsableEmail(addr)) {
          throw new BadRequestException(`Step ${order} needs a usable email address`);
        }
        email = addr;
        contactName = chosen.name?.trim() || addr;
      } else if (chosen?.userId || chosen?.customerId) {
        // An explicit choice still has to be one of the candidates — the picker
        // is a convenience, not an authorisation.
        const ok = candidates.some(
          (c) =>
            (c.kind === 'USER' && c.id === chosen.userId) ||
            ((c.kind === 'CUSTOMER' || c.kind === 'CONTACT') && c.id === chosen.customerId),
        );
        if (!ok) {
          throw new BadRequestException(`That signer cannot sign step ${order} of this document`);
        }
        userId = chosen.userId ?? null;
        if (userId) eligibleUserIds = [userId];
        // A space contact is identified as `space:<id>` and has no client row —
        // it carries an address, not a foreign key.
        const contact = candidates.find((c) => c.kind === 'CONTACT' && c.id === chosen.customerId);
        if (contact) {
          email = contact.email;
          contactName = contact.name;
        } else {
          customerId = chosen.customerId ?? null;
        }
      } else if (candidates.length === 1) {
        // Exactly one: there is no question to ask.
        const only = candidates[0];
        if (only.kind === 'USER') {
          userId = only.id;
          eligibleUserIds = [only.id];
        } else if (only.kind === 'CUSTOMER') {
          customerId = only.id;
        } else {
          /*
            A client SPACE's own contact — an address with no record behind it.

            There is nothing to point a foreign key at, and that is correct
            rather than a gap: the space carries the contact, and creating a
            client row to mirror it would make a second copy free to drift from
            the first. The address and the name are the whole identity.
          */
          email = only.email;
          contactName = only.name;
        }
      } else if (candidates.length > 1) {
        /*
          Several people may sign it, and any of them can.

          This used to refuse and make the issuer pick one — which is right when
          a step has a single responsible and wrong when a shift has a space
          manager and two shift leaders who can each countersign. Naming one of
          them at issue means the document waits on whoever is away.

          The step stays ONE row; it simply carries the set. `userId` is left
          null and records who actually signed, at the moment they do.
        */
        eligibleUserIds = candidates.filter((c) => c.kind === 'USER').map((c) => c.id);
        if (eligibleUserIds.length === 0) {
          // Several CUSTOMER or CONTACT candidates cannot be resolved this way:
          // a client is one counterparty, not a pool, so the issuer chooses.
          throw new BadRequestException(`Step ${order} has more than one possible signer — choose one before issuing`);
        }
      } else {
        /*
          Nobody can sign a step the type says must be signed.

          This used to create the step as SKIPPED, and that was wrong in the
          worst way available: the document went out looking like it had
          travelled the route, past the very approval the organisation
          configured, with nothing anywhere saying the step had been dropped.
          A time sheet reached the client without the agency ever countersigning
          it, and the register showed a healthy chain.

          Refusing is visible, it happens at the moment somebody can fix it, and
          nothing is half-issued. The message says what to configure, because
          "no signer found" sends an admin looking through the document rather
          than through the member's space membership, which is where the answer
          is.
        */
        throw new BadRequestException(noSignerMessage(step.role, order));
      }

      /*
        Freeze WHERE this step is reachable, at issue.

        The link resolves signer rows by address, so it has to be on the row —
        and it has to be a copy, not a lookup. A client changing their email
        next month must not silently redirect a document already in flight to
        an address nobody agreed to send it to.
      */
      if (!email && (customerId || userId)) {
        const resolved = customerId
          ? await tx.customer.findUnique({ where: { id: customerId }, select: { email: true, name: true } })
          : await tx.user.findUnique({
              where: { id: userId as string },
              select: { email: true, firstName: true, lastName: true },
            });
        if (resolved) {
          email = resolved.email ?? null;
          const person = 'firstName' in resolved ? personName(resolved) : '';
          contactName = ('name' in resolved ? resolved.name : null) ?? (person || null);
        }
      }

      /*
        The subject cannot hold a later step, however the request got here.

        Filtering the candidates stops it being OFFERED; this stops it being
        DONE. A typed-in address is checked against nothing else — that is the
        point of it — so this is the only thing standing between an issuer and a
        chain where the same person signs twice under two hats, which reads as
        three signatures and is worth one.
      */
      if (step.role !== 'MEMBER') {
        const subject = await tx.user.findUnique({
          where: { id: document.userId },
          select: { id: true, email: true },
        });
        if (subject && isSelfSigning(subject, { userId, email })) {
          throw new BadRequestException(
            `Step ${order} would be signed by the same person the document is about. A countersignature has to come from somebody else.`,
          );
        }
      }

      await tx.documentSigner.create({
        data: {
          documentId: document.id,
          order,
          role: step.role,
          userId,
          /*
            Whoever may sign, always — including the single-signer case.

            Keeping this populated even when one person is named is what lets
            "what is waiting for me" ask ONE indexed question instead of an OR
            across two columns, which no single index can serve. The fallback
            makes it an invariant rather than something three branches have to
            remember.
          */
          eligibleUserIds: eligibleUserIds.length ? eligibleUserIds : userId ? [userId] : [],
          customerId,
          /*
            Normalised, always.

            The link resolves rows by exact address, and it lowercases what a
            person types into the form. A contact stored as somebody typed it —
            "PLang@AgruAmerica.com" is what is actually in this database — would
            produce a row the link could never match, and a document waiting on
            a person who could never reach it.
          */
          email: email ? normalizeEmail(email) : null,
          contactName,
          status: 'PENDING',
        },
      });
    }
  }

  /**
   * Who could sign each step of a type's route, for one member.
   *
   * Asked BEFORE issuing, so the screen can present a choice where there is
   * one, rather than the service picking somebody and the issuer discovering it
   * afterwards. Returns candidates per step; the caller sends back a choice for
   * any step that has more than one.
   *
   * Zero candidates is not an error. A route asking for a customer, issued to a
   * member whose spaces have none, produces a SKIPPED step — the alternative is
   * a chain stranded forever on a signer who does not exist.
   */
  async routeCandidates(data: { actor: DocumentActor; memberId: string; typeId: string }) {
    if (!data.actor.canIssueDocuments) {
      throw new ForbiddenException('You cannot issue documents');
    }
    const org = data.actor.organizationId;

    const [type, member] = await Promise.all([
      this.prisma.documentType.findFirst({
        where: { id: data.typeId, organizationId: org },
        select: { id: true, label: true, signerRoute: true },
      }),
      this.prisma.user.findFirst({
        where: { id: data.memberId, organizationId: org },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    if (!type) throw new NotFoundException('Document type not found');
    if (!member) throw new NotFoundException('Member not found');

    const route = parseRoute(type.signerRoute);
    if (!route) return { steps: [] as RouteCandidateStep[] };

    const steps: RouteCandidateStep[] = [];
    for (const [i, s] of route.entries()) {
      steps.push({
        order: i + 1,
        role: s.role,
        candidates: await this.signers.candidatesForRole(org, member.id, s.role),
      });
    }
    return { steps };
  }
}
