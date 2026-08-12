import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

// Relays CRM domain mutations to the org's socket room so every open CRM view
// (board, lists, forecast) invalidates in real time — the same pattern as
// attendance_changed → attendance.changed.
@Controller()
export class CrmNotificationHandler {
  private readonly logger = new Logger(CrmNotificationHandler.name);

  constructor(private readonly websocketGateway: WebsocketGateway) {}

  @EventPattern('crm_changed')
  handleCrmChanged(
    @Payload() data: { organizationId: string; entity: string; action: string; id?: string },
  ) {
    if (!data?.organizationId) return;
    this.websocketGateway.emitToOrganization(data.organizationId, 'crm.changed', {
      entity: data.entity,
      action: data.action,
      id: data.id ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}
