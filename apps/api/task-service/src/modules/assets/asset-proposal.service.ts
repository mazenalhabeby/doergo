import {
  BadRequestException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { OBJECT_STORE, ObjectStore, extensionForMime, requireObjectStore } from '@hbcfield/shared/storage';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success, normalizeKindShape, activeAssignmentWhere,
  mayReviewProposal, proposalInSpace, proposalReviewSpaces, type ProposalPlace,
} from '@hbcfield/shared';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { AssetContractService, type ContractActor, type ContractFields } from './asset-contract.service';
import { AssetNotifier } from './asset-notifier.service';
import { AssetResponsibleService } from './asset-responsible.service';
import { findPrior } from '../../common/create-once.util';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_FILE_SIZE = 15 * 1024 * 1024;
/** One person cannot fill somebody's queue by holding down the shutter. */
const MAX_OPEN_PER_MEMBER = 10;
/** How many waiting proposals are read before a scoped (or one workspace's) queue is narrowed. */
const PENDING_SCAN = 500;

/** The columns that decide where a proposal belongs. */
type Placeable = { id: string; categoryId: string | null; holderUserId: string | null; raisedById: string };

export const PROPOSAL_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

/**
 * A member sends in a document; somebody responsible decides whether it becomes
 * a thing.
 *
 * ⚠️ THE MEMBER NEVER CREATES AN ASSET. Creating a record, reassigning the
 * organization's property and taking a vehicle off the books is
 * `canManageAssets` and always will be. What a driver handed a rental agreement
 * at a desk CAN do is send the page in — and that is the whole gap this closes,
 * because the alternative is the paper living in the door pocket until somebody
 * types it in March.
 *
 * ⚠️ THE FIELDS ARE STORED, NOT A PLAN. Which custody would close and which
 * record would be retired are recomputed at REVIEW time, by
 * `AssetContractService`, from the kind and from what the member holds then. A
 * plan frozen at upload would be stale the moment anything else changed — and
 * would be carried out anyway, which is the worst of both.
 *
 * ⚠️ IT GOES TO THE PEOPLE RESPONSIBLE FOR THAT MEMBER, not to every admin.
 * Same routing as a shift issue and a late clock-out: watchers ∪ the space's
 * configured roles. Where an organization has configured nobody, it falls back
 * to whoever can actually act — because unlike a notification about somebody's
 * hours, a proposal that reaches nobody is WORK THAT STOPS, and the member is
 * left waiting for an answer that will never come.
 */
@Injectable()
export class AssetProposalService {
  private readonly logger = new Logger(AssetProposalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: AssetContractService,
    private readonly routing: NotificationRoutingService,
    private readonly notifier: AssetNotifier,
    private readonly responsible: AssetResponsibleService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
  ) {}

  /**
   * Where a member's pages live.
   *
   * ⚠️ Per MEMBER, not per organization. The prefix used to be the organization's,
   * so the submit check accepted any page uploaded by anyone in it: a member who
   * obtained a colleague's key could raise a proposal on it and then open the
   * colleague's rental agreement — home address, licence number, bank details —
   * through their own proposal's link.
   */
  private prefix(organizationId: string, userId: string): string {
    return `${organizationId}/asset-proposals/${userId}/`;
  }

  // ── The page ───────────────────────────────────────────────────────────────

  /**
   * A URL to put the page at.
   *
   * Presigned before the proposal exists, so the key carries the organization
   * and a random id and the submit step refuses anything outside that prefix.
   * Bytes go phone → S3 directly; nothing large passes through the API.
   */
  async presign(data: { fileName: string; mimeType: string; userId: string; organizationId: string }) {
    if (!ALLOWED.includes(data.mimeType)) throw new BadRequestException('That kind of file is not a document');
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');

    // Never taken from the client: a filename is attacker-controlled and this
    // one becomes an object key.
    const key = `${this.prefix(data.organizationId, data.userId)}${randomUUID()}.${extensionForMime(data.mimeType)}`;
    const upload = await requireObjectStore(this.store).presignUpload(key, data.mimeType, undefined, 900);
    return success({ uploadUrl: upload.url, fileKey: key, expiresIn: 900, maxFileSize: MAX_FILE_SIZE });
  }

  /**
   * A short-lived link to one page.
   *
   * ⚠️ No list returns a URL. A rental agreement carries a home address, a
   * licence number and bank details; minting a link per request keeps looking
   * at one an act rather than a side effect of opening a queue.
   */
  async documentUrl(data: {
    id: string; userId: string; userRole: string; organizationId: string;
    /** Manages assets org-wide. */
    canManageAssets?: boolean;
    /** Manages assets in these workspaces only. */
    manageSpaceIds?: string[];
  }) {
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
    const mayDecide = data.canManageAssets === true ||
      ((data.manageSpaceIds?.length ?? 0) > 0 && (await this.reviewable(p, data.organizationId, data.manageSpaceIds)));
    if (p.raisedById !== data.userId && !mayDecide) {
      throw new NotFoundException('No document on that');
    }
    const url = await requireObjectStore(this.store).presignDownload(p.fileKey, undefined, 600, {
      inline: !!p.fileMime && ALLOWED.includes(p.fileMime),
      contentType: p.fileMime ?? undefined,
    });
    return success({ url, expiresIn: 600, mimeType: p.fileMime });
  }

  // ── Raising one ────────────────────────────────────────────────────────────

  async raise(data: {
    fields: ContractFields;
    signals?: string[];
    documentKind?: string;
    categoryId?: string;
    holderUserId?: string;
    fileKey?: string;
    fileName?: string;
    fileMime?: string;
    userId: string;
    userRole: string;
    organizationId: string;
    canManageAssets?: boolean;
    /** Made on the phone: a page sent in twice is one proposal. */
    id?: string;
  }) {
    // Answered before the open-proposal cap, which would count the resend against itself.
    const prior = await findPrior({
      id: data.id,
      find: (id) => this.prisma.assetProposal.findUnique({ where: { id } }),
      isSame: (p) => p.raisedById === data.userId && p.organizationId === data.organizationId,
    });
    if (prior) return success(prior);

    const fields = this.cleanFields(data.fields);
    /*
      Something has to identify the thing, or there is nothing for a reviewer to
      decide. Refused here rather than accepted and shown as an empty card,
      which is a queue item that can only be dismissed.
    */
    const identified = !!(fields.name || fields.registration || fields.vin || fields.serial ||
      (fields.manufacturer && fields.model));
    if (!identified) {
      throw new BadRequestException('Nothing on that page identifies a thing');
    }

    // A member may only raise one FOR THEMSELVES. Naming somebody else is how a
    // proposal quietly becomes a way to attach a vehicle to a colleague.
    const holderUserId = data.canManageAssets ? (data.holderUserId ?? data.userId) : data.userId;
    if (holderUserId !== data.userId) {
      const member = await this.prisma.user.findFirst({
        where: { id: holderUserId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!member) throw new BadRequestException('That person is not in this organization');
    }

    const open = await this.prisma.assetProposal.count({
      where: { organizationId: data.organizationId, raisedById: data.userId, status: PROPOSAL_STATUS.PENDING },
    });
    if (open >= MAX_OPEN_PER_MEMBER) {
      throw new BadRequestException('You already have several waiting — those have to be dealt with first');
    }

    // The key must be one WE presigned, for THIS organization.
    let fileKey: string | null = null;
    if (data.fileKey) {
      if (data.fileKey.includes('..') || !data.fileKey.startsWith(this.prefix(data.organizationId, data.userId))) {
        throw new BadRequestException('Invalid document');
      }
      const object = await requireObjectStore(this.store).head(data.fileKey);
      if (!object.exists) throw new BadRequestException('The page did not finish uploading — please try again');
      if (object.sizeBytes <= 0 || object.sizeBytes > MAX_FILE_SIZE) throw new BadRequestException('That file is too large');
      fileKey = data.fileKey;
    }

    /*
      The kind, only when there is no choice to make.

      A member does not know the organization's asset taxonomy and must not be
      asked to guess at one — but where exactly ONE kind in the organization is
      held by a member, there is nothing to choose and asking the reviewer to
      pick from a list of one is ceremony.
    */
    const categoryId = data.categoryId ?? (await this.onlyPossibleKind(data.organizationId));

    const proposal = await this.prisma.assetProposal.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        organizationId: data.organizationId,
        raisedById: data.userId,
        holderUserId,
        categoryId,
        fields: fields as unknown as Prisma.InputJsonValue,
        documentKind: data.documentKind === 'asset-contract' ? 'asset-contract' : 'unknown',
        signals: (data.signals ?? []).slice(0, 10) as unknown as Prisma.InputJsonValue,
        fileKey,
        fileName: fileKey ? data.fileName?.slice(0, 255) ?? null : null,
        fileMime: fileKey ? data.fileMime ?? null : null,
      },
    });

    await this.announce(proposal.id, data.organizationId, data.userId, fields);
    return success(proposal);
  }

  /** The one kind this could be, or nothing when it is a real choice. */
  private async onlyPossibleKind(organizationId: string): Promise<string | null> {
    const kinds = await this.prisma.assetCategory.findMany({
      where: { organizationId },
      select: { id: true, config: true },
      take: 50,
    });
    const usable = kinds.filter((k) => {
      const shape = normalizeKindShape(k.config);
      return shape.holder.enabled && shape.holder.members;
    });
    return usable.length === 1 ? usable[0]!.id : null;
  }

  /**
   * Tell the people responsible for that member.
   *
   * ⚠️ WITH A FALLBACK, unlike every other use of this routing.
   *
   * Attendance deliberately notifies NOBODY when an organization has configured
   * nobody: not being told about a late clock-out is a choice somebody made. A
   * proposal is different in kind — it is WORK THAT STOPS. The member is
   * waiting for an answer, and silence means they wait forever and stop sending
   * pages in. So where the routing is empty, it goes to whoever can actually
   * act on it.
   */
  private async announce(
    proposalId: string,
    organizationId: string,
    raisedById: string,
    fields: ContractFields,
  ): Promise<void> {
    try {
      const { ids } = await this.routing.resolveWatchers(raisedById, organizationId, 'tasks', false);
      let recipientIds = ids;

      if (recipientIds.length === 0) {
        /*
          The managers of the workspace it belongs to, before the whole office.

          Read through the SAME place the queue narrows by — the kind's
          workspace, or else the member's — so the people told are the people
          who will find it in their queue. Telling a depot manager about a van
          another depot has to create is a push they can do nothing with.
        */
        const proposal = await this.prisma.assetProposal.findUnique({
          where: { id: proposalId },
          select: { id: true, categoryId: true, holderUserId: true, raisedById: true },
        });
        if (proposal) {
          const place = (await this.placesOf([proposal], organizationId)).get(proposal.id)!;
          const local = await Promise.all(
            proposalReviewSpaces(place).map((spaceId) => this.responsible.spaceManagers(organizationId, spaceId)),
          );
          recipientIds = [...new Set(local.flat())].filter((id) => id !== raisedById);
        }
      }
      if (recipientIds.length === 0) {
        // The same approvers an expense falls back to, from the one place that
        // decides who can act on the register.
        recipientIds = await this.notifier.approvers(organizationId, raisedById);
      }
      if (recipientIds.length === 0) return;

      const raiser = await this.prisma.user.findUnique({
        where: { id: raisedById },
        select: { firstName: true, lastName: true },
      });

      this.notifications.emit('asset_proposal_raised', {
        proposalId,
        organizationId,
        raisedById,
        raiserName: `${raiser?.firstName ?? ''} ${raiser?.lastName ?? ''}`.trim(),
        name: fields.name || fields.registration || fields.vin || fields.serial || '',
        recipientIds,
      });
    } catch (e) {
      // Best effort: a proposal that failed to announce is still IN the queue,
      // and failing the member's upload because a socket was down would lose
      // the only copy of what they read off the page.
      this.logger.warn(`asset proposal announce failed: ${(e as Error).message}`);
    }
  }

  private cleanFields(raw: ContractFields | undefined): ContractFields {
    const out: ContractFields = {};
    for (const key of ['name', 'registration', 'vin', 'serial', 'manufacturer', 'model', 'startsOn', 'endsOn'] as const) {
      const v = raw?.[key];
      if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 120);
    }
    return out;
  }

  // ── Reading them ───────────────────────────────────────────────────────────

  /** What the caller has sent in, and what happened to it. */
  async mine(data: { userId: string; organizationId: string }) {
    const rows = await this.prisma.assetProposal.findMany({
      where: { organizationId: data.organizationId, raisedById: data.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, fields: true, status: true, reviewNote: true, reviewedAt: true,
        createdAssetId: true, createdAt: true, fileKey: true, documentKind: true,
      },
    });
    // The KEY never leaves the server — only whether there is a page.
    return success(rows.map(({ fileKey, ...r }) => ({ ...r, hasDocument: !!fileKey })));
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
    const scoped = data.manageSpaceIds !== undefined;
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
          if (scoped && !mayReviewProposal(place, data.manageSpaceIds)) return false;
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
        holder: r.holderUserId ? byId.get(r.holderUserId) ?? null : null,
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
      const applied: any = await this.contracts.apply({
        categoryId,
        typeId: data.typeId,
        holderUserId,
        fields,
        retireReplaced: data.retireReplaced,
        userId: data.userId,
        userRole: data.userRole,
        canViewAllTasks: data.canViewAllTasks,
        /*
          ⚠️ The reviewer's own workspaces travel into apply, which narrows the
          CHOSEN kind by its real workspace. Being allowed to review a proposal
          for a member of my depot is not being allowed to create it in another
          depot's register — a kind picked outside answers 404 there, and the
          catch below puts the proposal back in the queue.
        */
        manageSpaceIds: data.manageSpaceIds,
        organizationId: data.organizationId,
      }, {
        /*
          ⚠️ Quiet handover. The member is about to be told "Added to the
          register" by `tell` below, which says everything the handover push
          would — the thing is on the books and it is theirs. Both arriving
          together is one event announced twice, and the second one teaches
          people that this app repeats itself.
        */
        announceHandover: false,
      });

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

  /** The member changes their mind — their own, and only while it waits. */
  async withdraw(data: { id: string; userId: string; organizationId: string }) {
    const { count } = await this.prisma.assetProposal.updateMany({
      where: {
        id: data.id,
        organizationId: data.organizationId,
        raisedById: data.userId,
        status: PROPOSAL_STATUS.PENDING,
      },
      data: { status: PROPOSAL_STATUS.WITHDRAWN },
    });
    if (!count) throw new NotFoundException('That is not yours, or it has been decided');
    return success({ id: data.id, status: PROPOSAL_STATUS.WITHDRAWN });
  }

  // ── Where one belongs ──────────────────────────────────────────────────────

  /**
   * The place of each proposal: its kind's real workspace, and the member's
   * current assignments. Two queries however many rows.
   *
   * A `categoryId` that no longer resolves is read as "not chosen" — the kind
   * was deleted, and the reviewer is left exactly where a proposal without one
   * leaves them: they must choose.
   */
  private async placesOf(rows: Placeable[], organizationId: string): Promise<Map<string, ProposalPlace>> {
    const kindIds = [...new Set(rows.map((r) => r.categoryId).filter((v): v is string => !!v))];
    const holderIds = [...new Set(rows.map((r) => r.holderUserId ?? r.raisedById))];
    const { userId: _any, ...window } = activeAssignmentWhere('');

    const [kinds, assignments] = await Promise.all([
      kindIds.length
        ? this.prisma.assetCategory.findMany({
            where: { id: { in: kindIds }, organizationId },
            select: { id: true, spaceId: true },
          })
        : Promise.resolve([] as Array<{ id: string; spaceId: string | null }>),
      this.prisma.spaceAssignment.findMany({
        where: { ...window, organizationId, userId: { in: holderIds } },
        select: { userId: true, spaceId: true },
      }),
    ]);
    const kindSpace = new Map(kinds.map((k) => [k.id, k.spaceId]));
    const spacesOf = new Map<string, string[]>();
    for (const a of assignments) spacesOf.set(a.userId, [...(spacesOf.get(a.userId) ?? []), a.spaceId]);

    return new Map(rows.map((r) => [r.id, {
      kindSpaceId: r.categoryId && kindSpace.has(r.categoryId) ? kindSpace.get(r.categoryId) : undefined,
      holderSpaceIds: spacesOf.get(r.holderUserId ?? r.raisedById) ?? [],
    }]));
  }

  private async reviewable(row: Placeable, organizationId: string, manageSpaceIds?: string[]): Promise<boolean> {
    if (manageSpaceIds === undefined) return true;
    const place = (await this.placesOf([row], organizationId)).get(row.id)!;
    return mayReviewProposal(place, manageSpaceIds);
  }

  /**
   * Refuse a space-scoped reviewer a proposal outside their workspaces.
   *
   * ⚠️ 404, and the same sentence as one already decided. "That is waiting, you
   * just may not decide it" tells a depot manager what another depot is taking
   * on. Org-wide callers are not read here at all — the claim answers for them.
   */
  private async assertReviewable(id: string, actor: ContractActor): Promise<void> {
    if (actor.manageSpaceIds === undefined) return;
    const row = await this.prisma.assetProposal.findFirst({
      where: { id, organizationId: actor.organizationId, status: PROPOSAL_STATUS.PENDING },
      select: { id: true, categoryId: true, holderUserId: true, raisedById: true },
    });
    if (!row || !(await this.reviewable(row, actor.organizationId, actor.manageSpaceIds))) {
      throw new NotFoundException('That is not waiting for a decision');
    }
  }

  /**
   * Take it out of the queue before acting on it.
   *
   * A conditional update rather than a read-then-write: two reviewers opening
   * the queue at once would otherwise both see it pending, and the second would
   * create a SECOND vehicle from the same page.
   */
  private async claim(id: string, organizationId: string) {
    const { count } = await this.prisma.assetProposal.updateMany({
      where: { id, organizationId, status: PROPOSAL_STATUS.PENDING },
      data: { status: PROPOSAL_STATUS.ACCEPTED },
    });
    if (!count) throw new NotFoundException('That is not waiting for a decision');
    const row = await this.prisma.assetProposal.findUniqueOrThrow({ where: { id } });
    return row;
  }

  private tell(userId: string, proposalId: string, organizationId: string, outcome: string, detail: string) {
    try {
      this.notifications.emit('asset_proposal_decided', {
        proposalId, organizationId, userId, outcome, detail,
      });
    } catch (e) {
      this.logger.warn(`asset proposal decision emit failed: ${(e as Error).message}`);
    }
  }

  /** Remove the page behind a proposal nobody needs any more. Best effort. */
  async forgetDocument(key: string | null | undefined): Promise<void> {
    if (!key || !this.store) return;
    if (!(await this.store.delete(key))) this.logger.warn(`Could not remove proposal document ${key}`);
  }
}
