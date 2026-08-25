import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationRoutingService } from './notification-routing.service';

/**
 * Cache invalidation for "who is notified about this member".
 *
 * Delivered as a published EVENT rather than a direct call because the write
 * that causes it happens in another service (member watchers live in
 * auth-service), and because each replica of this service holds its own cache —
 * a local clear would leave every other replica serving the old recipients
 * until the TTL expired. A publish reaches all of them, the publisher included.
 *
 * Fire-and-forget by design: a lost invalidation costs at most the 60s TTL,
 * which is exactly where this started, so it can never be worse than not
 * having it.
 */
@Controller()
export class NotificationRoutingController {
  private readonly logger = new Logger(NotificationRoutingController.name);

  constructor(private readonly routing: NotificationRoutingService) {}

  @EventPattern('notification_routing_changed')
  onRoutingChanged(@Payload() data: { organizationId?: string; subjectUserId?: string }) {
    if (!data?.organizationId) return;
    const dropped = this.routing.invalidate(data.organizationId, data.subjectUserId);
    this.logger.debug(
      `routing cache invalidated (${dropped}) org=${data.organizationId} subject=${data.subjectUserId ?? 'all'}`,
    );
  }
}
