import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';
import { OBJECT_STORE, ObjectStore, extensionForMime, requireObjectStore } from '@hbcfield/shared/storage';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService, success, normalizeKindShape, activeAssignmentWhere, personPasses } from '@hbcfield/shared';
import { type ContractFields } from './asset-contract.service';
import { findPrior } from '../../../common/create-once.util';
import {
  ALLOWED,
  MAX_FILE_SIZE,
  MAX_OPEN_PER_MEMBER,
  PROPOSAL_STATUS,
  cleanProposalFields,
  proposalPrefix,
} from './asset-proposal-helpers';
import { ProposalNoticesService } from './proposal-notices.service';

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
    private readonly notices: ProposalNoticesService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    // Withdrawn: approvals half-way under an office rule end with it.
    private readonly rules: ApprovalRulesService,
  ) {}

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
    const key = `${proposalPrefix(data.organizationId, data.userId)}${randomUUID()}.${extensionForMime(data.mimeType)}`;
    const upload = await requireObjectStore(this.store).presignUpload(key, data.mimeType, undefined, 900);
    return success({ uploadUrl: upload.url, fileKey: key, expiresIn: 900, maxFileSize: MAX_FILE_SIZE });
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

    const fields = cleanProposalFields(data.fields);
    /*
      Something has to identify the thing, or there is nothing for a reviewer to
      decide. Refused here rather than accepted and shown as an empty card,
      which is a queue item that can only be dismissed.
    */
    const identified = !!(
      fields.name ||
      fields.registration ||
      fields.vin ||
      fields.serial ||
      (fields.manufacturer && fields.model)
    );
    if (!identified) {
      throw new BadRequestException('Nothing on that page identifies a thing');
    }

    // A member may only raise one FOR THEMSELVES. Naming somebody else is how a
    // proposal quietly becomes a way to attach a vehicle to a colleague.
    const holderUserId = data.canManageAssets ? (data.holderUserId ?? data.userId) : data.userId;
    if (holderUserId !== data.userId) {
      const member = await personPasses(this.prisma, holderUserId, { organizationId: data.organizationId });
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
      if (data.fileKey.includes('..') || !data.fileKey.startsWith(proposalPrefix(data.organizationId, data.userId))) {
        throw new BadRequestException('Invalid document');
      }
      const object = await requireObjectStore(this.store).head(data.fileKey);
      if (!object.exists) throw new BadRequestException('The page did not finish uploading — please try again');
      if (object.sizeBytes <= 0 || object.sizeBytes > MAX_FILE_SIZE)
        throw new BadRequestException('That file is too large');
      fileKey = data.fileKey;
    }

    /*
      The kind, only when there is no choice to make.

      A member does not know the organization's asset taxonomy and must not be
      asked to guess at one — but where exactly ONE kind in the organization is
      held by a member, there is nothing to choose and asking the reviewer to
      pick from a list of one is ceremony.
    */
    const categoryId = data.categoryId
      ? await this.chosenKind(data.categoryId, holderUserId, data.organizationId)
      : await this.onlyPossibleKind(data.organizationId);

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
        fileName: fileKey ? (data.fileName?.slice(0, 255) ?? null) : null,
        fileMime: fileKey ? (data.fileMime ?? null) : null,
      },
    });

    await this.notices.raised(proposal.id, data.organizationId, data.userId, fields);
    return success(proposal);
  }

  /**
   * A kind the member CHOSE, checked before it is written.
   *
   * The id came from the body. Unchecked, it could name another organization's
   * kind — or a kind in a workspace the holder is not in, which routes the
   * proposal (and its review: `mayReviewProposal` decides by the kind's
   * workspace) into a depot that has nothing to do with them. A kind must be
   * this organization's, and either organization-wide or in a workspace the
   * holder is assigned to now. Anything else reads as absent: 404.
   */
  private async chosenKind(categoryId: string, holderUserId: string, organizationId: string): Promise<string> {
    const kind = await this.prisma.assetCategory.findFirst({
      where: { id: categoryId, organizationId },
      select: { id: true, spaceId: true },
    });
    if (kind?.spaceId) {
      const here = await this.prisma.spaceAssignment.findFirst({
        where: { ...activeAssignmentWhere(holderUserId), organizationId, spaceId: kind.spaceId },
        select: { id: true },
      });
      if (here) return kind.id;
    } else if (kind) {
      return kind.id;
    }
    throw new NotFoundException('That kind of thing is not available here');
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

  // ── Reading them ───────────────────────────────────────────────────────────

  /** What the caller has sent in, and what happened to it. */
  async mine(data: { userId: string; organizationId: string }) {
    const rows = await this.prisma.assetProposal.findMany({
      where: { organizationId: data.organizationId, raisedById: data.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        fields: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        createdAssetId: true,
        createdAt: true,
        fileKey: true,
        documentKind: true,
      },
    });
    // The KEY never leaves the server — only whether there is a page.
    return success(rows.map(({ fileKey, ...r }) => ({ ...r, hasDocument: !!fileKey })));
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
    await this.rules.clearItem('assetProposal', data.id);
    return success({ id: data.id, status: PROPOSAL_STATUS.WITHDRAWN });
  }

  /** Remove the page behind a proposal nobody needs any more. Best effort. */
  async forgetDocument(key: string | null | undefined): Promise<void> {
    if (!key || !this.store) return;
    if (!(await this.store.delete(key))) this.logger.warn(`Could not remove proposal document ${key}`);
  }
}
