import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { joined, msg, plural, type Msg } from '../i18n/translate';

interface DueItem {
  logType: string;
  label: string;
  stage: 'soon' | 'overdue';
  daysLeft: number | null;
  unitsLeft: number | null;
  unit: string | null;
}

/**
 * Something on an asset is due: an oil change, a safety check, a service.
 *
 * Sent by the logbook's daily sweep, already deduplicated there (once per
 * asset, type, window and stage), to whoever holds the thing and whoever is
 * responsible for it. One push per asset, however many of its types came due
 * on the same morning — three pushes about one van is how a van gets muted.
 *
 * The socket event lets an open record page refresh its "next due" without a
 * reload.
 */
@Controller()
export class AssetLogNotificationHandler {
  private readonly logger = new Logger('AssetLogNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @EventPattern('asset_log_due')
  async handleDue(@Payload() data: any) {
    const recipientIds: string[] = Array.isArray(data?.recipientIds) ? data.recipientIds : [];
    const items: DueItem[] = Array.isArray(data?.items) ? data.items : [];
    if (recipientIds.length === 0 || items.length === 0) return;

    for (const id of recipientIds) this.websocketGateway.emitToUser(id, 'asset_log.due', data);

    const asset = String(data.assetName ?? '').slice(0, 80) || msg('assetLog.anAsset');
    const overdue = items.some((i) => i.stage === 'overdue');
    const described = items.map(describe);
    try {
      await this.pushService.sendToUsers(
        recipientIds,
        {
          title: msg(overdue ? 'assetLog.title.overdue' : 'assetLog.title.soon', { asset }),
          body: msg('common.verbatim', { text: joined(described, ' · ') }, 180),
        },
        {
          type: 'asset_log_due',
          assetId: data.assetId,
          logType: items[0]?.logType,
        },
      );
    } catch (e) {
      this.logger.error(`asset log due push failed: ${(e as Error).message}`);
    }
  }
}

/** "Oil change in 12 days or 800 km", "Service 400 km overdue". */
function describe(item: DueItem): Msg {
  const label = String(item.label ?? '').slice(0, 40);
  const units = typeof item.unitsLeft === 'number' ? item.unitsLeft : null;
  const days = typeof item.daysLeft === 'number' ? item.daysLeft : null;
  const unit = item.unit ? ` ${item.unit}` : '';
  const amount = (n: number) => msg('assetLog.amount', { n, unit });
  const inDays = (n: number) => plural('assetLog.days', n);
  if (item.stage === 'overdue') {
    if (units !== null && units <= 0) return msg('assetLog.item.overdueBy', { label, amount: amount(Math.abs(units)) });
    if (days !== null) return msg('assetLog.item.overdueBy', { label, amount: inDays(Math.abs(days)) });
    return msg('assetLog.item.overdue', { label });
  }
  // Whichever first, so both limits are said when a type has both.
  if (days !== null && units !== null) {
    return msg('assetLog.item.inEither', { label, days: inDays(days), amount: amount(units) });
  }
  if (days !== null) return msg('assetLog.item.in', { label, amount: inDays(days) });
  if (units !== null) return msg('assetLog.item.in', { label, amount: amount(units) });
  return msg('assetLog.item.dueSoon', { label });
}
