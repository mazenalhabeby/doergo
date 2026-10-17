import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { requireObjectStore } from '@hbcfield/shared/storage';
import { Prisma } from '@prisma/client';
import { success, mayReviewProposal, proposalInSpace } from '@hbcfield/shared';
import { type ContractActor, type ContractFields } from './asset-contract.service';
import { assetScope } from './asset-access.service';
import { ALLOWED, PENDING_SCAN, PROPOSAL_STATUS } from './asset-proposal-helpers';
import { AssetProposalBase } from './asset-proposal.base';

/**
 * The office's side of a page a member sent in: the queue, accepting (which runs
 * the contract apply), refusing, opening the page.
 */
@Injectable()
export class ProposalReviewService extends AssetProposalBase {
  /**
   * A short-lived link to one page.
   *
   * ⚠️ No list returns a URL. A rental agreement carries a home address, a
   * licence number and bank details; minting a link per request keeps looking
   * at one an act rather than a side effect of opening a queue.
   */
  async documentUrl(data: { id: string } & ContractActor) {
    const p = await this.prisma.assetProposal.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, fileKey: true, fileMime: true, raisedById: true, holderUserId: true, categoryId: true },
    });
    if (!p?.fileKey) throw new NotFoundException('No document on that');
    /*
      The person who sent it, or somebody who may decide it. A Space Manager
      reviewing a driver's page must be able to read the page — and only the
      pages their queue would show them, by the same rule.
    */
    const manage = assetScope(data, 'manage');
    const mayDecide = manage === null || (manage.length > 0 && (await this.reviewable(p, data.organizationId, manage)));
    if (p.raisedById !== data.userId && !mayDecide) {
      throw new NotFoundException('No document on that');
    }
    const url = await requireObjectStore(this.store).presignDownload(p.fileKey, undefined, 600, {
      inline: !!p.fileMime && ALLOWED.includes(p.fileMime),
      contentType: p.fileMime ?? undefined,
    });
    return success({ url, expiresIn: 600, mimeType: p.fileMime });
  }

  /**
   * Everything waiting on a decision — that THIS caller may decide.
   *
   * An org-wide manager sees the whole queue, as before. A space-scoped one sees
   * what `mayReviewProposal` gives them, filtered with the very function accept
   * and reject ask, so the list and the refusal cannot drift: a row in the
   * queue is a row they can act on, and nothing else is shown.
   *
   * `spaceId` narrows to ONE workspace's own — the Assets tab of that workspace
   * — by `proposalInSpace`, the same rule asked of one place. It is ANDed with
   * the caller's scope and can only ever remove rows: a workspace the caller
   * does not manage simply shows what they could already decide there, which
   * is nothing unless the member is also one of theirs. Absent, the whole
   * in-scope queue, as the org-wide Assets page shows it.
   */
  async pending(data: ContractActor & { spaceId?: string }) {
    this.contracts.assertMay(data, 'view assets');
    const manage = assetScope(data, 'manage');
    const scoped = manage !== null;
    const forSpaceId = typeof data.spaceId === 'string' && data.spaceId ? data.spaceId : undefined;
    const narrowed = scoped || forSpaceId !== undefined;
    const found = await this.prisma.assetProposal.findMany({
      where: { organizationId: data.organizationId, status: PROPOSAL_STATUS.PENDING },
      orderBy: { createdAt: 'desc' },
      // Narrowed in memory below, so a narrowed queue reads further before it cuts.
      take: narrowed ? PENDING_SCAN : 100,
      select: {
        id: true, fields: true, signals: true, documentKind: true, categoryId: true,
        raisedById: true, holderUserId: true, createdAt: true, fileKey: true, fileName: true,
      },
    });
    let rows = found;
    if (narrowed && found.length > 0) {
      // Kinds and assignments are read inside THIS organization only, so a
      // workspace id from somewhere else places nothing and matches nothing.
      const places = await this.placesOf(found, data.organizationId);
      rows = found
        .filter((r) => {
          const place = places.get(r.id)!;
          if (scoped && !mayReviewProposal(place, manage)) return false;
          return forSpaceId === undefined || proposalInSpace(place, forSpaceId);
        })
        .slice(0, 100);
    }
    if (rows.length === 0) return success({ proposals: [] });

    const ids = [...new Set(rows.flatMap((r) => [r.raisedById, r.holderUserId]).filter((v): v is string => !!v))];
    const people = await this.prisma.user.findMany({
      where: { id: { in: ids }, organizationId: data.organizationId },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));

    return success({
      proposals: rows.map(({ fileKey, ...r }) => ({
        ...r,
        hasDocument: !!fileKey,
        raisedBy: byId.get(r.raisedById) ?? null,
        holder: r.holderUserId ? (byId.get(r.holderUserId) ?? null) : null,
      })),
    });
  }

  // ── Deciding ───────────────────────────────────────────────────────────────

  /**
   * Accept it: create the thing, hand it over, retire what it replaces.
   *
   * ⚠️ The plan is built HERE AND NOW by the contract service, from the kind
   * and from what the member holds today — never from anything stored on the
   * proposal. A page uploaded three weeks ago may name a van that has since
   * been given to somebody else, and executing a plan frozen at upload would
   * quietly undo that.
   */
  async accept(data: {
    id: string;
    categoryId?: string;
    typeId?: string;
    fields?: ContractFields;
    retireReplaced?: boolean;
  } & ContractActor) {
    this.contracts.assertMay(data, 'update assets');
    // Out of scope answers exactly like decided or missing — and before the
    // claim, so a refused reviewer never takes it out of somebody else's queue.
    await this.assertReviewable(data.id, data);

    const proposal = await this.claim(data.id, data.organizationId);

    const categoryId = data.categoryId ?? proposal.categoryId;
    if (!categoryId) throw new BadRequestException('Choose what kind of thing this is');
    const holderUserId = proposal.holderUserId ?? proposal.raisedById;

    try {
      // The reviewer's corrections win over what was sent in; they are looking
      // at the page too, on a bigger screen.
      const fields = { ...(proposal.fields as ContractFields), ...this.cleanFields(data.fields) };
      const applied = await this.contracts.apply({
        categoryId,
        typeId: data.typeId,
        holderUserId,
        fields,
        retireReplaced: data.retireReplaced,
        userId: data.userId,
        userRole: data.userRole,
        isExternal: data.isExternal,
        canManageAssets: data.canManageAssets,
        /*
          ⚠️ The reviewer's own workspaces travel into apply, which narrows the
          CHOSEN kind by its real workspace. Being allowed to review a proposal
          for a member of my depot is not being allowed to create it in another
          depot's register — a kind picked outside answers 404 there, and the
          catch below puts the proposal back in the queue.
        */
          manageSpaceIds: data.manageSpaceIds,
          organizationId: data.organizationId,
        },
        {
          /*
          ⚠️ Quiet handover. The member is about to be told "Added to the
          register" by `tell` below, which says everything the handover push
          would — the thing is on the books and it is theirs. Both arriving
          together is one event announced twice, and the second one teaches
          people that this app repeats itself.
        */
          announceHandover: false,
        },
      );

      const assetId = applied?.data?.assetId ?? null;
      await this.prisma.assetProposal.update({
        where: { id: proposal.id },
        data: {
          status: PROPOSAL_STATUS.ACCEPTED,
          reviewedById: data.userId,
          reviewedAt: new Date(),
          categoryId,
          createdAssetId: assetId,
          fields: fields as unknown as Prisma.InputJsonValue,
        },
      });

      this.tell(proposal.raisedById, proposal.id, data.organizationId, 'accepted', applied?.data?.name ?? '');
      return success({ id: proposal.id, assetId, status: PROPOSAL_STATUS.ACCEPTED });
    } catch (e) {
      /*
        ⚠️ Put it back in the queue.

        `claim` took it out so two reviewers cannot both act on it. If the apply
        then fails — a kind that holds clients, a name nobody supplied — the row
        must return to PENDING, or one bad click makes a member's proposal
        disappear with nothing created and nothing said.
      */
      await this.prisma.assetProposal.updateMany({
        where: { id: proposal.id, status: PROPOSAL_STATUS.ACCEPTED, createdAssetId: null },
        data: { status: PROPOSAL_STATUS.PENDING, reviewedById: null, reviewedAt: null },
      });
      throw e;
    }
  }

  /** Refuse it, with a reason the member reads. */
  async reject(data: { id: string; note?: string } & ContractActor) {
    this.contracts.assertMay(data, 'update assets');
    await this.assertReviewable(data.id, data);
    const { count } = await this.prisma.assetProposal.updateMany({
      where: { id: data.id, organizationId: data.organizationId, status: PROPOSAL_STATUS.PENDING },
      data: {
        status: PROPOSAL_STATUS.REJECTED,
        reviewedById: data.userId,
        reviewedAt: new Date(),
        reviewNote: data.note?.trim().slice(0, 300) || null,
      },
    });
    if (!count) throw new NotFoundException('That is not waiting for a decision');

    const p = await this.prisma.assetProposal.findUnique({
      where: { id: data.id },
      select: { raisedById: true },
    });
    if (p) this.tell(p.raisedById, data.id, data.organizationId, 'rejected', data.note ?? '');
    return success({ id: data.id, status: PROPOSAL_STATUS.REJECTED });
  }
}
