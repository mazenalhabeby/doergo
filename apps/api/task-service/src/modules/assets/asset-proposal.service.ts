import {
  BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, normalizeKindShape, isAdmin, Role } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { AssetAccessService } from './asset-access.service';
import { AssetContractService, type ContractFields } from './asset-contract.service';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf',
};
const MAX_FILE_SIZE = 15 * 1024 * 1024;
/** One person cannot fill somebody's queue by holding down the shutter. */
const MAX_OPEN_PER_MEMBER = 10;

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
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly access: AssetAccessService,
    private readonly contracts: AssetContractService,
    private readonly routing: NotificationRoutingService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {
    this.endpoint = this.config.get<string>('S3_ENDPOINT', 'https://hel1.your-objectstorage.com');
    this.bucket = this.config.get<string>('S3_BUCKET', 'hbcfield');
    this.s3 = new S3Client({
      endpoint: this.endpoint,
      region: this.config.get<string>('S3_REGION', 'eu-central'),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', ''),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', ''),
      },
      forcePathStyle: true,
    });
  }

  private prefix(organizationId: string): string {
    return `${organizationId}/asset-proposals/`;
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
    const key = `${this.prefix(data.organizationId)}${randomUUID()}.${EXT[data.mimeType] ?? 'bin'}`;
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: data.mimeType }),
      { expiresIn: 900 },
    );
    return success({ uploadUrl, fileKey: key, expiresIn: 900, maxFileSize: MAX_FILE_SIZE });
  }

  /**
   * A short-lived link to one page.
   *
   * ⚠️ No list returns a URL. A rental agreement carries a home address, a
   * licence number and bank details; minting a link per request keeps looking
   * at one an act rather than a side effect of opening a queue.
   */
  async documentUrl(data: {
    id: string; userId: string; userRole: string; organizationId: string; canManageAssets?: boolean;
  }) {
    const p = await this.prisma.assetProposal.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { fileKey: true, fileMime: true, raisedById: true },
    });
    if (!p?.fileKey) throw new NotFoundException('No document on that');
    // The person who sent it, or somebody who may act on it.
    if (p.raisedById !== data.userId && !data.canManageAssets) {
      throw new NotFoundException('No document on that');
    }
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: p.fileKey }),
      { expiresIn: 600 },
    );
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
  }) {
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
      if (!data.fileKey.startsWith(this.prefix(data.organizationId))) {
        throw new BadRequestException('Invalid document');
      }
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
        recipientIds = await this.whoCanAct(organizationId, raisedById);
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

  /**
   * Everyone who could actually accept it — the fallback, never the first choice.
   *
   * ⚠️ `canManageAssets` is NOT a column on User. It is resolved at sign-in from
   * the member's ORG role (`accessAllows(access, 'canManageAssets') ||
   * accessAllows(access, 'canManageUsers')`), so finding the holders means
   * reading the roles that grant it and then the people who hold those roles.
   *
   * Org-scoped roles only, matching the endpoint: `POST
   * /assets/contracts/apply` is `@RequirePermission`, so a space role however
   * senior is refused there — and telling somebody about work they will be
   * refused is worse than telling them nothing.
   */
  private async whoCanAct(organizationId: string, exceptUserId: string): Promise<string[]> {
    const roles = await this.prisma.accessRole.findMany({
      where: { organizationId, isActive: true, scope: { not: 'SPACE' as never } },
      select: { id: true, permissions: true },
    });
    const granting = roles
      .filter((r) => {
        const p = (r.permissions ?? {}) as Record<string, unknown>;
        return p.canManageAssets === true || p.canManageUsers === true;
      })
      .map((r) => r.id);

    const people = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        isExternal: false,
        id: { not: exceptUserId },
        // An admin is one by being one, exactly as PermissionsGuard decides it.
        OR: [
          { role: Role.ADMIN as never },
          { canManageUsers: true },
          ...(granting.length ? [{ memberRoleId: { in: granting } }] : []),
        ],
      },
      select: { id: true },
      take: 25,
    });
    return people.map((p) => p.id);
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

  /** Everything waiting on a decision. */
  async pending(data: { userId: string; userRole: string; organizationId: string }) {
    this.access.assertMay(data as any, 'view assets');
    const rows = await this.prisma.assetProposal.findMany({
      where: { organizationId: data.organizationId, status: PROPOSAL_STATUS.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, fields: true, signals: true, documentKind: true, categoryId: true,
        raisedById: true, holderUserId: true, createdAt: true, fileKey: true, fileName: true,
      },
    });
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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');

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
        organizationId: data.organizationId,
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
  async reject(data: {
    id: string; note?: string; userId: string; userRole: string; organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');
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
    if (!key) return;
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      this.logger.warn(`Could not remove proposal document ${key}: ${(e as Error).message}`);
    }
  }
}
