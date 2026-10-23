import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, personNameOf, personName, proposalReviewSpaces } from '@hbcfield/shared';
import { emitEvent, assetProposalDecidedEvent, assetProposalRaisedEvent } from '@hbcfield/shared/microservices';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { type ContractFields } from './asset-contract.service';
import { AssetNotifier } from '../core/asset-notifier.service';
import { AssetResponsibleService } from '../core/asset-responsible.service';
import { ProposalPlacesService } from './proposal-places.service';

/** Who is told about a page a member sent in: the reviewers when it arrives, the member when it is decided. */
@Injectable()
export class ProposalNoticesService {
  private readonly logger = new Logger(ProposalNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: NotificationRoutingService,
    private readonly notifier: AssetNotifier,
    private readonly responsible: AssetResponsibleService,
    private readonly places: ProposalPlacesService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

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
  async raised(proposalId: string, organizationId: string, raisedById: string, fields: ContractFields): Promise<void> {
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
          const place = (await this.places.placesOf([proposal], organizationId)).get(proposal.id)!;
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

      const raiser = await personNameOf(this.prisma, raisedById);

      emitEvent(this.notifications, assetProposalRaisedEvent, {
        proposalId,
        organizationId,
        raisedById,
        raiserName: personName(raiser),
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

  decided(userId: string, proposalId: string, organizationId: string, outcome: string, detail: string) {
    try {
      emitEvent(this.notifications, assetProposalDecidedEvent, {
        proposalId,
        organizationId,
        userId,
        outcome,
        detail,
      });
    } catch (e) {
      this.logger.warn(`asset proposal decision emit failed: ${(e as Error).message}`);
    }
  }
}
