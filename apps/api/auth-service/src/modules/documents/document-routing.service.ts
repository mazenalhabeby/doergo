import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  parseRoute,
  isCurrentSigner,
  counterpartySourceFor,
  isUsableEmail,
  isSelfSigning,
  chainProgress,
  resolveMemberRouting,
  type DocumentSignerRole,
  type SignerStep,
  normalizeEmail,
} from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  assertTypeVisible,
  assertNotHiddenDraft,
  type SignerCandidate,
  type RouteCandidateStep,
} from './document-common';

/**
 * The signing route: who each step of a type's chain resolves to, frozen onto a
 * document when it is issued, and what is waiting on whom.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentRoutingService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

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
          : await this.candidatesForRole(document.organizationId, document.userId, step.role);

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
          throw new BadRequestException(
            `Step ${order} has more than one possible signer — choose one before issuing`,
          );
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
        throw new BadRequestException(this.noSignerMessage(step.role, order));
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
          : await tx.user.findUnique({ where: { id: userId as string }, select: { email: true, firstName: true, lastName: true } });
        if (resolved) {
          email = (resolved as any).email ?? null;
          const person = `${(resolved as any).firstName ?? ''} ${(resolved as any).lastName ?? ''}`.trim();
          contactName = (resolved as any).name ?? (person || null);
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
   * The chain on one document, for somebody about to sign it.
   *
   * A signer needs to see what is above their name — a manager countersigning a
   * time sheet is agreeing with the worker's signature, and being asked to do
   * that blind is being asked to rubber-stamp.
   *
   * Readable by anyone IN the chain, or by anyone allowed to see member
   * documents. Deliberately not gated on `canOpenMemberDocuments`: who signed
   * and when is metadata, and needing the right to read a payslip in order to
   * see whether it was signed would make the whole register unusable.
   */
  async documentChain(data: { actor: DocumentActor; documentId: string }) {
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      select: { id: true, title: true, userId: true, status: true, hiddenFromMember: true, rolesOverridden: true, visibleToRoleIds: true, type: { select: { visibleToRoleIds: true } } },
    });
    if (!document) throw new NotFoundException('Document not found');
    assertNotHiddenDraft(data.actor, document);

    const rows = await this.prisma.documentSigner.findMany({
      where: { documentId: document.id },
      orderBy: { order: 'asc' },
      select: {
        order: true, role: true, status: true, userId: true, eligibleUserIds: true,
        customerId: true, signedAt: true,
        user: { select: { firstName: true, lastName: true } },
        customer: { select: { name: true } },
      },
    });

    // Same reasoning as opening it: somebody asked to sign must be able to see
    // what has been signed above them, and until they sign there is no userId
    // on their step to match.
    const inChain = rows.some(
      (r) =>
        r.userId === data.actor.userId ||
        (r.eligibleUserIds ?? []).includes(data.actor.userId),
    );
    const isSubject = document.userId === data.actor.userId;
    // 404, not 403 — the same answer as a document that does not exist.
    if (!inChain && !isSubject && !data.actor.canViewMemberDocuments) {
      throw new NotFoundException('Document not found');
    }
    // Read AFTER the chain is known: a signer routed onto this document reads it
    // through their step, not through the type.
    assertTypeVisible(data.actor, document, inChain);

    const steps = rows.map((r) => ({
      order: r.order,
      role: r.role,
      status: r.status,
      name: r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : (r.customer?.name ?? null),
      signedAt: r.signedAt,
      isYou: r.userId === data.actor.userId,
    }));

    const progress = chainProgress(rows as unknown as SignerStep[]);
    return {
      documentId: document.id,
      title: document.title,
      steps,
      total: progress.total,
      signed: progress.signed,
      complete: progress.complete,
      currentOrder: progress.current?.order ?? null,
    };
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
        candidates: await this.candidatesForRole(org, member.id, s.role),
      });
    }
    return { steps };
  }

  /**
   * The people a single role could resolve to.
   *
   * Each role answers a different question, and none of them is "pick an admin
   * and hope":
   *
   *   MEMBER              the person the document is about — always exactly one
   *   RESPONSIBLE         their `approve` routing, which is configured per
   *                       member and is deliberately not their notify list
   *   ORG_REPRESENTATIVE  somebody who may sign for the organization. Scoped to
   *                       the permission to issue documents rather than to
   *                       "admin", so it follows the same authority that puts a
   *                       document into somebody's file in the first place.
   *   CUSTOMER            clients of the spaces this member works in. The
   *                       document carries no space of its own, so the member is
   *                       what connects it to a client.
   */
  /**
   * Documents belonging to SOMEBODY ELSE that are waiting on this person now.
   *
   * Every other query on this screen is scoped to the caller's own personnel
   * file, which is right for a payslip and wrong for a countersignature: a
   * responsible signing a worker's time sheet is not the subject of it and so
   * never saw it. It arrived as a push notification about a document that
   * existed nowhere in the app.
   *
   * Authorisation is the signer row itself — being named as the signer of a
   * step is what entitles someone to that one document, and nothing else. Only
   * the CURRENT step qualifies: a document three people down the chain must not
   * appear on somebody's list before it is their turn, or the list stops
   * meaning "yours to do" and stops being read.
   *
   * Shared by the list and the badge so the two can never disagree about what
   * is outstanding.
   */
  async documentsWaitingOnMe(actor: DocumentActor) {
    const rows = await this.prisma.document.findMany({
      where: {
        organizationId: actor.organizationId,
        userId: { not: actor.userId },
        status: 'AWAITING_SIGNATURE',
        /*
          Narrowed in SQL; whether it is their TURN is decided below, since
          "first pending step" is not expressible here and duplicating that rule
          in a query is how the two drift.

          Either named on the step or among the people it is open to — a step
          with three eligible leaders is genuinely waiting on all three, and
          matching only `userId` would hide it from everyone until somebody had
          already signed it.
        */
        signers: { some: { status: 'PENDING', eligibleUserIds: { has: actor.userId } } },
      },
      select: {
        id: true,
        title: true,
        typeId: true,
        periodYear: true,
        periodMonth: true,
        status: true,
        sizeBytes: true,
        mimeType: true,
        issuedAt: true,
        expiresOn: true,
        firstOpenedAt: true,
        user: { select: { firstName: true, lastName: true } },
        type: { select: { key: true, label: true, signatureMode: true, isCredential: true } },
        signers: { select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true } },
      },
      orderBy: { issuedAt: 'asc' },
      // A backstop, not pagination. Somebody with more than this waiting has a
      // process problem that a longer list would not solve.
      take: 200,
    });

    return rows.filter((d) =>
      isCurrentSigner(d.signers as unknown as SignerStep[], actor.userId),
    );
  }

  /** Why a step cannot be filled, and what to do about it. */
  private noSignerMessage(role: DocumentSignerRole, order: number): string {
    switch (role) {
      case 'RESPONSIBLE':
        return `Step ${order} needs the person who signs off for this member, and nobody is set. Choose one under “Signs off for …” on their space membership.`;
      case 'ORG_REPRESENTATIVE':
        return `Step ${order} needs somebody signing for the organisation, and nobody in it can. Give a member the right to manage people, or remove the step from this document type.`;
      case 'SITE_SUPERVISOR':
        return `Step ${order} needs the client's supervisor on a space this member works in, and none is assigned. Invite their supervisor as an external member of that space, or remove the step from this document type.`;
      case 'CUSTOMER':
        return `Step ${order} needs the client of a space this member works in, and there is none. Add the client to the space, or remove the step from this document type.`;
      default:
        return `Step ${order} of this document has no possible signer.`;
    }
  }

  /**
   * `candidatesForRole` memoised for the length of one call.
   *
   * ORG_REPRESENTATIVE is the same answer for every member in the batch, so it
   * is keyed without one; the others genuinely differ per member.
   */
  cachedCandidatesForRole(
    cache: Map<string, Promise<SignerCandidate[]>>,
    organizationId: string,
    memberId: string,
    role: DocumentSignerRole,
  ): Promise<SignerCandidate[]> {
    const key = role === 'ORG_REPRESENTATIVE' ? role : `${role}:${memberId}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = this.candidatesForRole(organizationId, memberId, role);
    cache.set(key, pending);
    return pending;
  }

  private async candidatesForRole(
    organizationId: string,
    memberId: string,
    role: DocumentSignerRole,
  ): Promise<SignerCandidate[]> {
    /*
      Who the document is ABOUT, so they can be kept off every later step.

      A chain means something because each step is a different person vouching.
      The member appearing again under a second hat — a client record carrying
      their own address, or an admin account that is also the subject — makes
      every signature below the first one prove nothing, and it happens quietly
      rather than by anybody deciding it should.
    */
    const subject =
      role === 'MEMBER'
        ? null
        : await this.prisma.user.findUnique({
            where: { id: memberId },
            select: { id: true, email: true },
          });
    const notTheSubject = (c: SignerCandidate) =>
      !subject ||
      !isSelfSigning(subject, { userId: c.kind === 'USER' ? c.id : null, email: c.email });
    if (role === 'MEMBER') {
      const u = await this.prisma.user.findUnique({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      return u ? [{ kind: 'USER', id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email }] : [];
    }

    if (role === 'RESPONSIBLE') {
      // allowLeaderDefault false: a space nobody configured contributes no one.
      // Sign-off is not something to fall into by being a space leader.
      const ids = await resolveMemberRouting(this.prisma as any, organizationId, memberId, 'approve', false);
      ids.delete(memberId); // nobody approves their own hours
      if (ids.size === 0) return [];
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...ids] }, organizationId, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      return users
        .map((u) => ({
          kind: 'USER' as const, id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email,
        }))
        .filter(notTheSubject);
    }

    if (role === 'ORG_REPRESENTATIVE') {
      const users = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          customerId: null,
          OR: [{ role: 'ADMIN' }, { canManageUsers: true }],
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        take: 50,
      });
      return users
        .map((u) => ({
          kind: 'USER' as const, id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email,
        }))
        .filter(notTheSubject);
    }

    if (role === 'SITE_SUPERVISOR') {
      /*
        The client's own supervisor on the site.

        Resolved through the SPACE, not through the member's routing: this
        signature says "the company whose site this is accepts what happened
        there", and it is the space that names that company. An external member
        is assigned to exactly one space, so their presence on the roster IS
        the claim to represent it.

        `isExternal` is the whole filter — internal colleagues on the same
        roster sign as RESPONSIBLE if anybody, never as the client. One query,
        one join, bounded: the roster of the member's spaces, narrowed to
        external members in the database rather than fetched and filtered here.
      */
      const users = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          isExternal: true,
          id: { not: memberId },
          spaceAssignments: {
            some: {
              organizationId,
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
              // The spaces this member works in — the sites their document is about.
              space: {
                spaceAssignments: {
                  some: {
                    userId: memberId,
                    OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
                  },
                },
              },
            },
          },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        // Same ceiling the other roles use: a candidate list is a picker, not a
        // report, and an unbounded one is a denial-of-service on the issue screen.
        take: 50,
      });
      return users
        .map((u) => ({
          kind: 'USER' as const, id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email,
        }))
        .filter(notTheSubject);
    }

    /*
      CUSTOMER — through the member's spaces, since a document has no space.

      Where the counterparty comes from is DECIDED by the space, not configured:

        • the space IS a client company (`kind: CUSTOMER`) → its own contact,
          because the details are already there and a CRM record would be a
          second copy of them, free to drift
        • an internal space with the CRM module on → its client records
        • neither → nothing is offered, and the issuer types the address

      Typing it in is always available whatever this returns. A cascade decides
      what is OFFERED and must never decide what is possible: the one time
      somebody has to send a document to a person the system has never heard of
      is exactly when a closed list makes the product useless.
    */
    const spaces = await this.prisma.spaceAssignment.findMany({
      where: { userId: memberId, organizationId },
      select: {
        space: { select: { id: true, name: true, kind: true, contactName: true, contactEmail: true, enabledModules: true } },
      },
    });
    if (spaces.length === 0) return [];

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { enabledModules: true },
    });

    const out: SignerCandidate[] = [];
    const crmSpaceIds: string[] = [];

    for (const { space } of spaces) {
      if (!space) continue;
      // A space's own modules override the org's — the same rule the gates use.
      const modules = (space.enabledModules ?? org?.enabledModules ?? []) as string[];
      const source = counterpartySourceFor(space, Array.isArray(modules) ? modules : []);

      if (source === 'SPACE' && space.contactEmail) {
        out.push({
          kind: 'CONTACT',
          // The SPACE is the identity here: there is no client row to point at,
          // and the address is what the link will be addressed to anyway.
          id: `space:${space.id}`,
          name: space.contactName?.trim() || space.name,
          email: space.contactEmail,
        });
      } else if (source === 'CRM') {
        crmSpaceIds.push(space.id);
      }
    }

    if (crmSpaceIds.length > 0) {
      const customers = await this.prisma.customer.findMany({
        where: { organizationId, isActive: true, spaceId: { in: crmSpaceIds } },
        select: { id: true, name: true, email: true },
        take: 50,
      });
      for (const c of customers) {
        out.push({ kind: 'CUSTOMER', id: c.id, name: c.name, email: c.email ?? null });
      }
    }

    return out.filter(notTheSubject);
  }
}
