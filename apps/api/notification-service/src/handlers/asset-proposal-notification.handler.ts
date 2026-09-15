import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { msg, verbatim } from '../i18n/translate';

/**
 * A member sent in a page that looks like a contract for a thing.
 *
 * Two events, and they travel in opposite directions:
 *
 *   · `asset_proposal_raised` goes UP, to whoever is responsible for that
 *     member. It is the whole point of the feature — a proposal nobody is told
 *     about is a driver waiting for an answer that never comes, and the second
 *     time that happens they stop sending pages in.
 *   · `asset_proposal_decided` goes back DOWN, to the member. A refusal with no
 *     reason teaches nothing and gets re-sent unchanged.
 *
 * The socket event also reaches the raiser on the way up, so their own "what I
 * sent in" list updates without a reload.
 */
@Controller()
export class AssetProposalNotificationHandler {
  private readonly logger = new Logger('AssetProposalNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @EventPattern('asset_proposal_raised')
  async handleRaised(@Payload() data: any) {
    const recipientIds: string[] = data.recipientIds ?? [];
    const targets = new Set<string>([...recipientIds, data.raisedById].filter(Boolean));
    for (const id of targets) this.websocketGateway.emitToUser(id, 'asset_proposal.raised', data);

    const name = data.raiserName || msg('common.aMember');
    try {
      await this.pushService.sendToUsers(
        recipientIds,
        {
          title: msg('proposal.raised.title'),
          body: data.name
            ? msg('proposal.raised.bodyNamed', { name, asset: data.name })
            : msg('proposal.raised.body', { name }),
        },
        { type: 'asset_proposal', kind: 'raised', proposalId: data.proposalId },
      );
    } catch (e) {
      this.logger.error(`asset proposal push failed: ${(e as Error).message}`);
    }
  }

  @EventPattern('asset_proposal_decided')
  async handleDecided(@Payload() data: any) {
    if (!data.userId) return;
    this.websocketGateway.emitToUser(data.userId, 'asset_proposal.decided', data);

    const accepted = data.outcome === 'accepted';
    const detail = String(data.detail ?? '').slice(0, 120);
    try {
      await this.pushService.sendToUser(
        data.userId,
        accepted
          ? {
              title: msg('proposal.accepted.title'),
              body: detail ? msg('proposal.accepted.body', { detail }) : msg('proposal.accepted.bodyGeneric'),
            }
          : {
              title: msg('proposal.rejected.title'),
              // The reason, verbatim. A refusal with none teaches nothing.
              body: detail ? verbatim(detail) : msg('proposal.rejected.bodyGeneric'),
            },
        { type: 'asset_proposal', kind: 'decided', proposalId: data.proposalId },
      );
    } catch (e) {
      this.logger.error(`asset proposal decision push failed: ${(e as Error).message}`);
    }
  }
}
