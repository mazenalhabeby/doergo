import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

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

    const asset = String(data.assetName ?? '').slice(0, 80) || 'An asset';
    const overdue = items.some((i) => i.stage === 'overdue');
    const title = overdue ? `${asset}: overdue` : `${asset}: due soon`;
    const body = items.map(describe).join(' · ').slice(0, 180);

    for (const id of recipientIds) {
      try {
        await this.pushService.sendToUser(id, title, body, {
          type: 'asset_log_due',
          assetId: data.assetId,
          logType: items[0]?.logType,
        });
      } catch (e) {
        this.logger.error(`asset log due push failed: ${(e as Error).message}`);
      }
    }
  }
}

/** "Oil change in 12 days or 800 km", "Service 400 km overdue". */
function describe(item: DueItem): string {
  const label = String(item.label ?? '').slice(0, 40);
  const units = typeof item.unitsLeft === 'number' ? item.unitsLeft : null;
  const days = typeof item.daysLeft === 'number' ? item.daysLeft : null;
  const unit = item.unit ? ` ${item.unit}` : '';
  if (item.stage === 'overdue') {
    if (units !== null && units <= 0) return `${label} ${Math.abs(units).toLocaleString('en')}${unit} overdue`;
    if (days !== null) return `${label} ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
    return `${label} overdue`;
  }
  // Whichever first, so both limits are said when a type has both.
  const parts = [
    days !== null ? `${days} day${days === 1 ? '' : 's'}` : null,
    units !== null ? `${units.toLocaleString('en')}${unit}` : null,
  ].filter(Boolean);
  return parts.length ? `${label} in ${parts.join(' or ')}` : `${label} due soon`;
}
