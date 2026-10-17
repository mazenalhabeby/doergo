import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

/** Live updates for open screens: presence, workspaces, rosters, clock-ins, rests. */
@Controller()
export class AttendanceLiveHandler {
  private readonly logger = new Logger('AttendanceLiveHandler');

  constructor(private readonly websocketGateway: WebsocketGateway) {}

  // Availability status (Available/Busy/Away) changed — broadcast so teammates'
  // dashboards / contact lists update in real time.
  @EventPattern('presence_changed')
  handlePresenceChanged(@Payload() data: { userId: string; presence: string | null; organizationId: string }) {
    this.websocketGateway.emitPresenceChanged(data.userId, data.presence, data.organizationId);
  }

  /**
   * Space and roster changes. These carry no notification of their own — they
   * exist so open dashboards and space lists re-read instead of showing stale
   * data until someone hits refresh, which was the last case in the app that
   * still required one.
   */
  @EventPattern('space_changed')
  async handleSpaceChanged(@Payload() data: { organizationId: string; spaceId?: string | null }) {
    this.websocketGateway.emitSpaceChanged(data.organizationId, data.spaceId ?? null);
  }

  @EventPattern('document_types_changed')
  async handleDocumentTypesChanged(@Payload() data: { organizationId: string; typeId?: string | null }) {
    this.websocketGateway.emitDocumentTypesChanged(data.organizationId, data.typeId ?? null);
  }

  @EventPattern('space_roster_changed')
  async handleSpaceRosterChanged(@Payload() data: { organizationId: string; spaceId?: string | null }) {
    this.websocketGateway.emitSpaceRosterChanged(data.organizationId, data.spaceId ?? null);
  }

  @EventPattern('attendance_clock_in')
  async handleClockIn(@Payload() data: { userId: string; organizationId: string; timeEntry: any }) {
    this.logger.log(`Clock-in: user=${data.userId}`);
    this.websocketGateway.emitClockIn(data.userId, data.organizationId, data.timeEntry);
  }

  @EventPattern('attendance_clock_out')
  async handleClockOut(@Payload() data: { userId: string; organizationId: string; timeEntry: any }) {
    this.logger.log(`Clock-out: user=${data.userId}`);
    this.websocketGateway.emitClockOut(data.userId, data.organizationId, data.timeEntry);
  }

  // Admin-side attendance mutation (edit/approve/reject/delete/manual-add) →
  // broadcast so every open attendance view refreshes live, no page reload.
  @EventPattern('attendance_changed')
  handleAttendanceChanged(@Payload() data: { organizationId: string; action: string; entryId?: string }) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance.changed', {
      action: data.action,
      entryId: data.entryId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern('break_started')
  async handleBreakStarted(@Payload() data: {
    userId: string;
    userName: string;
    breakId: string;
    breakType: string;
    startedAt: string;
    organizationId: string;
  }) {
    this.logger.log(`Break started: user=${data.userName}, type=${data.breakType}`);
    this.websocketGateway.emitBreakStarted(data.userId, data.organizationId, {
      breakId: data.breakId,
      userId: data.userId,
      userName: data.userName,
      type: data.breakType,
      startedAt: data.startedAt,
    });
  }

  @EventPattern('break_ended')
  async handleBreakEnded(@Payload() data: {
    userId: string;
    userName: string;
    breakId: string;
    breakType: string;
    startedAt: string;
    endedAt: string;
    durationMinutes: number;
    organizationId: string;
  }) {
    this.logger.log(`Break ended: user=${data.userName}, duration=${data.durationMinutes}min`);
    this.websocketGateway.emitBreakEnded(data.userId, data.organizationId, {
      breakId: data.breakId,
      userId: data.userId,
      userName: data.userName,
      type: data.breakType,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      durationMinutes: data.durationMinutes,
    });
  }
}
